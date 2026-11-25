/** Dry-run by default. Private, hash-checked source findings; no financial or master writes. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../src/lib/db";
const args = process.argv.slice(2), input = args[args.indexOf("--input") + 1];
if (!args.includes("--input") || !input) throw Error("Gunakan --input <manifest JSON privat> [--apply].");
const schema = z.array(z.strictObject({ companyId: z.string().min(1), sourceId: z.string().min(1), name: z.string().min(1),
  file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), modifiedAt: z.iso.datetime(),
  findings: z.array(z.strictObject({ key: z.string().regex(/^[A-Z0-9_-]+$/), sheet: z.string().min(1), row: z.number().int().positive(), note: z.string().min(20).max(4000) })).min(1),
}));
try {
  const entries = schema.parse(JSON.parse(readFileSync(input, "utf8"))), apply = args.includes("--apply");
  for (const e of entries) if (createHash("sha256").update(readFileSync(e.file)).digest("hex") !== e.sha256) throw Error("Hash sumber berubah. Kaji ulang sebelum impor temuan.");
  if (apply) await db.$transaction(async tx => {
    for (const e of entries) {
      await tx.company.findUniqueOrThrow({ where: { id: e.companyId } });
      const batchId = `source-review:${e.companyId}:${e.sourceId}:${e.sha256.slice(0, 16)}`, sourceFileId = `${batchId}:file`;
      await tx.dataImportBatch.upsert({ where: { id: batchId }, update: {}, create: { id: batchId, companyId: e.companyId, name: "Kajian sumber Drive — perlu verifikasi", status: "REVIEW", stats: { sha256: e.sha256, controlFindings: e.findings.length, noFinancialPosting: true }, completedAt: new Date() } });
      await tx.sourceFile.upsert({ where: { id: sourceFileId }, update: {}, create: { id: sourceFileId, companyId: e.companyId, name: e.name, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", path: "Drive/kajian-sumber", url: `https://drive.google.com/file/d/${encodeURIComponent(e.sourceId)}/view`, sha256: e.sha256, modifiedAt: new Date(e.modifiedAt), status: "REVIEW", rowCount: e.findings.length, notes: "Temuan pemeriksaan; nominal tidak diimpor menjadi transaksi atau saldo." } });
      for (const f of e.findings) {
        const id = `${batchId}:${f.key}`;
        await tx.sourceFact.upsert({ where: { id }, update: {}, create: { id, companyId: e.companyId, batchId, sourceFileId, sourceKey: id, kind: "CONTROL", sheet: f.sheet, row: f.row, status: "UNMATCHED", data: { rule: f.key, description: f.note, sourceHash: e.sha256, reviewOnly: true } } });
      }
      if (!await tx.auditEvent.count({ where: { companyId: e.companyId, action: "SOURCE_FINDINGS_STAGED", entityId: batchId } })) await tx.auditEvent.create({ data: { companyId: e.companyId, action: "SOURCE_FINDINGS_STAGED", entityId: batchId, details: { sha256: e.sha256, findings: e.findings.length, noFinancialPosting: true } } });
    }
  }, { timeout: 60000 });
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", sources: entries.length, findings: entries.reduce((n, e) => n + e.findings.length, 0), financialWrites: 0 }));
} finally { await db.$disconnect(); }
