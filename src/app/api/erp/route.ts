import { NextResponse } from "next/server";
import {
  snapshot,
  createJournal,
  saveAccount,
  deleteAccount,
  postDraft,
  reverseJournal,
  previewClosing,
  closePeriod,
} from "@/lib/accounting";
import { assertCloseAllowed } from "@/lib/finalization";
import {
  requireActor,
  authorizeCompany,
  allowedBranches,
  checkOrigin,
  AccessError,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("journal"), data: z.unknown() }),
  z.object({ action: z.literal("account"), data: z.unknown() }),
  z.object({ action: z.literal("deleteAccount"), id: z.string() }),
  z.object({ action: z.literal("post"), id: z.string() }),
  z.object({
    action: z.literal("reverse"),
    id: z.string(),
    periodId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({ action: z.literal("preview"), periodId: z.string() }),
  z.object({ action: z.literal("close"), periodId: z.string() }),
]);
function fail(e: unknown) {
  const message =
    e instanceof z.ZodError
      ? e.issues.map((i) => i.message).join("; ")
      : e instanceof Error
        ? e.message
        : "Permintaan gagal";
  if (e instanceof AccessError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (message === "UNAUTHORIZED")
    return NextResponse.json({ error: "Silakan login." }, { status: 401 });
  console.error(message);
  return NextResponse.json(
    {
      error: message.includes("Unique constraint")
        ? "Data duplikat atau jurnal sudah dibalik."
        : message.includes("Record to")
          ? "Data tidak ditemukan."
          : message.includes("Invalid `")
            ? "Operasi database gagal. Periksa data atau periode."
            : message,
    },
    { status: 400 },
  );
}
export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    const params = new URL(req.url).searchParams,
      company = params.get("company") ?? "DEMO";
    authorizeCompany(actor, company, [
      "ADMIN",
      "FINANCE",
      "MANAGER",
      "AUDITOR",
    ]);
    if (allowedBranches(actor, company).length)
      throw new AccessError(
        "Laporan keuangan seluruh perusahaan memerlukan cakupan semua cabang.",
      );
    if (actor.mustChangePassword)
      throw new AccessError("Ganti kata sandi awal.", 428);
    return NextResponse.json(
      await snapshot(params.get("period") ?? undefined, company),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await requireActor();
    checkOrigin(req);
    const a = actionSchema.parse(await req.json());
    let scope = "DEMO";
    if ("periodId" in a) {
      const period = await db.fiscalPeriod.findUniqueOrThrow({
        where: { id: a.periodId },
      });
      scope = period.companyId;
    } else if (a.action === "journal") {
      const period = await db.fiscalPeriod.findUniqueOrThrow({
        where: { id: String((a.data as { periodId?: string })?.periodId) },
      });
      scope = period.companyId;
    } else if (a.action === "post") {
      const entry = await db.journalEntry.findUniqueOrThrow({
        where: { id: a.id },
        include: { period: true },
      });
      scope = entry.period.companyId;
    }
    authorizeCompany(actor, scope, ["ADMIN", "FINANCE"]);
    if (allowedBranches(actor, scope).length)
      throw new AccessError(
        "Posting jurnal umum memerlukan cakupan semua cabang.",
      );
    if (actor.mustChangePassword)
      throw new AccessError("Ganti kata sandi awal.", 428);
    if (a.action === "account" || a.action === "deleteAccount")
      authorizeCompany(actor, scope, ["ADMIN"]);
    if (a.action === "reverse") {
      const original = await db.journalEntry.findUniqueOrThrow({
        where: { id: a.id },
        include: { period: true },
      });
      if (original.period.companyId !== scope)
        throw new Error("Tidak dapat membalik jurnal antar perusahaan.");
      if (await db.businessRecord.count({ where: { journalId: a.id } }))
        throw new Error(
          "Jurnal berasal dari dokumen operasional; lakukan koreksi melalui dokumen Finance dengan referensi sumber.",
        );
    }
    let result;
    switch (a.action) {
      case "journal":
        result = await createJournal(a.data, actor.id);
        break;
      case "account":
        result = await saveAccount(a.data);
        break;
      case "deleteAccount":
        result = await deleteAccount(a.id);
        break;
      case "post":
        result = await postDraft(a.id, actor.id);
        break;
      case "reverse":
        result = await reverseJournal(a.id, a.periodId, a.date, actor.id);
        break;
      case "preview":
        result = await previewClosing(a.periodId);
        break;
      case "close":
        await assertCloseAllowed(a.periodId);
        result = await closePeriod(a.periodId, actor.id);
    }
    return NextResponse.json({ result: result ?? true });
  } catch (e) {
    return fail(e);
  }
}
