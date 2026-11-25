import { apiFail } from "@/lib/api-error";
import {
  sourceWhere,
  importWhere,
  requireSourceAccess,
} from "@/lib/operations/visibility";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireActor,
  authorizeCompany,
  checkOrigin,
  AccessError,
  companyRole,
  allowedBranches,
} from "@/lib/auth";
import { operationSnapshot } from "@/lib/operations/read";
import { moduleMiniDashboard } from "@/lib/operations/mini-dashboard";
import { managementReport } from "@/lib/management-report";
import { bankReconciliation } from "@/lib/bank-reconciliation";
import { finalizationStatus, updateFinalization, finalizationPermissions } from "@/lib/finalization";
import {
  saveRecord,
  saveMaster,
  transitionRecord,
  audit,
} from "@/lib/operations/engine";
import { manageSettings, changePassword } from "@/lib/operations/settings";
import { atomic, object, str, json } from "@/lib/operations/shared";
import {sourceData,reviewSource,prepareStockOpening} from '@/lib/operations/source-data';
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await requireActor(true),
      p = new URL(req.url).searchParams,
      companyId = p.get("company") ?? "KBA";
    if (actor.mustChangePassword)
      return NextResponse.json(
        {
          passwordChangeRequired: true,
          actor: { id: actor.id, name: actor.name, email: actor.email },
        },
        { status: 428 },
      );
    if (p.get('view') === 'module-kpis') return NextResponse.json(await moduleMiniDashboard(actor, companyId, p.get('module') ?? '', {
      branchId: p.get('branch') || undefined, query: p.get('q') || undefined, periodId: p.get('period') || undefined,
    }), { headers: { 'Cache-Control': 'no-store' } });
    if(p.get('view')==='source-data')return NextResponse.json(await sourceData(actor,companyId,p),{headers:{'Cache-Control':'no-store'}});
    if (p.get("view") === "finalization") {
      authorizeCompany(actor, companyId, ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"]);
      if (allowedBranches(actor, companyId).length)
        throw new AccessError("Finalisasi memerlukan akses seluruh perusahaan.");
      return NextResponse.json({ ...await finalizationStatus(companyId, p.get("period") ?? ""), permissions: finalizationPermissions(actor, companyId) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (p.get("view") === "bank-reconciliation")
      return NextResponse.json(await bankReconciliation(actor, companyId, p.get("period") ?? "", p.get("account") || undefined), { headers: { "Cache-Control": "no-store" } });
    if (p.get("view") === "management-report") {
      authorizeCompany(actor, companyId, ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"]);
      if (allowedBranches(actor, companyId).length)
        throw new AccessError("Laporan manajemen memerlukan akses seluruh perusahaan.");
      return NextResponse.json(await managementReport(companyId, p.get("period") || undefined), { headers: { "Cache-Control": "no-store" } });
    }
    if (p.get("view") === "accounts") {
      authorizeCompany(actor, companyId, [
        "ADMIN",
        "FINANCE",
        "MANAGER",
        "AUDITOR",
      ]);
      return NextResponse.json({
        accounts: await db.account.findMany({ orderBy: { code: "asc" } }),
      });
    }
    if (p.get("view") === "record") {
      authorizeCompany(actor, companyId);
      const record = await db.businessRecord.findFirstOrThrow({
        where: { id: p.get("id") ?? "", companyId },
        include: { lines: true },
      });
      const role = authorizeCompany(
        actor,
        companyId,
        undefined,
        record.branchId,
      );
      if (role === "STAFF" && record.actorId !== actor.id)
        throw new AccessError("Tidak diizinkan.");
      if (
        role === "HR" &&
        !["attendances", "shifts", "timesheets", "project", "quality"].includes(
          record.module,
        )
      )
        throw new AccessError("Modul di luar akses HR.");
      return NextResponse.json({ record });
    }
    if (p.get("view") === "imports") {
      const role = requireSourceAccess(actor, companyId);
      const page = Math.max(0, Number(p.get("page") ?? 0) || 0),
        kind = p.get("kind") ?? undefined;
      const where = importWhere(companyId, role, kind);
      const [rows, total] = await Promise.all([
        db.importRow.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: page * 50,
          take: 50,
        }),
        db.importRow.count({ where }),
      ]);
      return NextResponse.json({ rows, total, page });
    }
    if (p.get("view") === "sources") {
      const role = requireSourceAccess(actor, companyId);
      const q = p.get("q") ?? "",
        page = Math.max(0, Number(p.get("page") ?? 0) || 0),
        where = sourceWhere(companyId, role, q);
      const [files, total] = await Promise.all([
        db.sourceFile.findMany({
          where,
          orderBy: { path: "asc" },
          skip: page * 50,
          take: 50,
        }),
        db.sourceFile.count({ where }),
      ]);
      return NextResponse.json({ files, total, page });
    }
    return NextResponse.json(
      await operationSnapshot(actor, companyId, {
        module: p.get("module") ?? undefined,
        kind: p.get("kind") ?? undefined,
        branchId: p.get("branch") ?? undefined,
        page: Number(p.get("page") ?? 0) || 0,
        query: p.get("q") ?? undefined,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiFail(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = await requireActor(true);
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 1024 * 1024)
      throw new Error("Permintaan terlalu besar.");
    const body = object(await req.json()),
      action = str(body.action),
      companyId = str(body.companyId);
    if (actor.mustChangePassword && action !== "password")
      throw new AccessError("Ganti kata sandi awal terlebih dahulu.", 428);
    let result;
    if (action === "finalization") {
      authorizeCompany(actor, companyId, ["ADMIN", "FINANCE", "MANAGER"]);
      if (allowedBranches(actor, companyId).length)
        throw new AccessError("Finalisasi memerlukan akses seluruh perusahaan.");
      result = { ...await updateFinalization(actor, companyId, body.data), permissions: finalizationPermissions(actor, companyId) };
    } else
    if(action==='prepareStockOpening')result=await prepareStockOpening(actor,body.data);
    else if(action==='reviewSource')result=await reviewSource(actor,body.data);
    else if (action === "record") result = await saveRecord(actor, body.data);
    else if (action === "master") result = await saveMaster(actor, body.data);
    else if (action === "transition")
      result = await transitionRecord(actor, body.data);
    else if (action === "settings")
      result = await manageSettings(actor, body.data);
    else if (action === "password")
      result = await changePassword(actor, body.data);
    else if (action === "message") {
      const m = z
        .object({
          body: z.string().trim().min(1).max(4000),
          channel: z
            .string()
            .regex(/^[a-z0-9-]{1,50}$/)
            .default("umum"),
          branchId: z.string().nullable().optional(),
        })
        .parse(body.data);
      authorizeCompany(actor, companyId, undefined, m.branchId);
      if (m.channel === "notifikasi")
        throw new AccessError("Kanal notifikasi hanya untuk sistem.");
      result = await atomic(companyId, async (tx) => {
        if (m.branchId)
          await tx.branch.findFirstOrThrow({
            where: { id: m.branchId, companyId },
          });
        const r = await tx.discussion.create({
          data: { companyId, ...m, authorId: actor.id, authorName: actor.name },
        });
        await audit(tx, actor, companyId, "MESSAGE_CREATED", r.id);
        return r;
      });
    } else if (action === "reviewImport") {
      requireSourceAccess(actor, companyId, [
        "ADMIN",
        "FINANCE",
        "MANAGER",
        "HR",
      ]);
      const d = object(body.data);
      result = await atomic(companyId, async (tx) => {
        const row = await tx.importRow.findFirstOrThrow({
          where: { id: str(d.id), companyId },
        });
        if (row.status !== "REVIEW") throw new Error("Baris sudah ditinjau.");
        if (
          row.kind === "EMPLOYEE" &&
          !["ADMIN", "HR", "MANAGER"].includes(companyRole(actor, companyId))
        )
          throw new Error("Data HR memerlukan hak HR.");
        if (d.decision !== "REJECT")
          throw new Error(
            "Buka dan lengkapi dokumen target sebelum verifikasi. Verifikasi harus menghasilkan draft yang tervalidasi.",
          );
        const updated = await tx.importRow.update({
          where: { id: row.id },
          data: {
            status: "REJECTED",
            issue: str(d.reason) || "Ditolak oleh peninjau.",
          },
        });
        await audit(tx, actor, companyId, "IMPORT_REVIEWED", row.id, {
          decision: "REJECTED",
        });
        return updated;
      });
    } else throw new Error("Aksi tidak dikenal.");
    return NextResponse.json({ result: result ?? true });
  } catch (e) {
    return apiFail(e);
  }
}
