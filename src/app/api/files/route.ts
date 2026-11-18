import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireActor,
  authorizeCompany,
  allowedBranches,
  checkOrigin,
} from "@/lib/auth";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const actor = await requireActor();
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 6 * 1024 * 1024)
      throw new Error("Batas unggahan 5 MB.");
    const form = await req.formData();
    const companyId = String(form.get("companyId") ?? "DEMO");
    authorizeCompany(actor, companyId);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 5 * 1024 * 1024 ||
      file.size === 0
    )
      throw new Error("Pilih file hingga 5 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime =
      bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "image/jpeg"
            : null;
    if (!mime) throw new Error("Hanya PDF, PNG, dan JPEG valid yang diterima.");
    const dir = path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    const name = randomUUID();
    await writeFile(path.join(dir, name), bytes, { flag: "wx" });
    const result = await db.attachment.create({
      data: {
        companyId,
        ownerId: actor.id,
        name: file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 150),
        mime,
        path: name,
      },
    });
    return NextResponse.json({ id: result.id, name: result.name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unggah gagal." },
      { status: 400 },
    );
  }
}
export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const file = await db.attachment.findUniqueOrThrow({ where: { id } });
    const role = authorizeCompany(actor, file.companyId),
      branches = allowedBranches(actor, file.companyId);
    if (file.ownerId !== actor.id) {
      if (!["ADMIN", "MANAGER", "FINANCE", "AUDITOR"].includes(role))
        throw new Error("Bukti di luar cakupan akses.");
      if (
        branches.length &&
        !(await db.businessRecord.count({
          where: {
            companyId: file.companyId,
            branchId: { in: branches },
            data: { path: ["attachmentId"], equals: file.id },
          },
        }))
      )
        throw new Error("Bukti di luar cabang yang diizinkan.");
    }
    const bytes = await readFile(
      path.join(process.cwd(), "uploads", path.basename(file.path)),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "File tidak tersedia." },
      { status: 404 },
    );
  }
}
