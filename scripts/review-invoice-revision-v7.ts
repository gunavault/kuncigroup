/** Default dry-run. Adds versioned UNMATCHED source facts, never masters, transactions or journal postings. */
import "dotenv/config";
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { invoiceRevisionRows } from "../src/lib/invoice-revision";
import { json } from "../src/lib/operations/shared";
const sourceId = "1g5UlDm9uaUJorIRb_GxbCV1krKMxMDOQ", args = process.argv.slice(2), apply = args.includes("--apply");
const arg = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const currentPath = arg("--current", "data/drive-v7/invoice-recap-20261123.xlsx"), previousPath = arg("--previous", `data/drive/${sourceId}.xlsx`);
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sha256 = digest(currentPath), previousSha256 = digest(previousPath);
function cell(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") { if ("result" in value) return cell(value.result as ExcelJS.CellValue); if ("error" in value) return value.error; if ("richText" in value) return value.richText.map(x => x.text).join(""); if ("text" in value) return value.text; return null; }
  return value ?? null;
}
async function rows(path: string) { const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path); const sheet = book.getWorksheet("2026"); if (!sheet) throw Error("Sheet 2026 tidak ditemukan."); return Array.from({ length: sheet.rowCount }, (_, i) => Array.from({ length: sheet.getRow(i + 1).cellCount }, (_, j) => cell(sheet.getCell(i + 1, j + 1).value))); }
try {
  const prepared = invoiceRevisionRows(await rows(currentPath), await rows(previousPath));
  const candidates = prepared.rows.filter(r => r.companyId), held = prepared.rows.filter(r => !r.companyId);
  const counts = Object.fromEntries(["KBA", "KCG", "KCL", "KBL"].map(id => [id, candidates.filter(r => r.companyId === id).length]));
  const summary = { mode: apply ? "APPLY" : "DRY_RUN", sha256, previousSha256, changedBusinessRows: prepared.rows.length, candidates: candidates.length, heldForIssuerReview: held.length, byCompany: counts };
  mkdirSync("data/drive-v7", { recursive: true }); writeFileSync("data/drive-v7/invoice-revision-review.json", JSON.stringify({ ...summary, headers: prepared.headers, rows: prepared.rows }, null, 2));
  if (apply) await db.$transaction(async tx => {
    const originalSource = await tx.sourceFile.findUniqueOrThrow({ where: { id: sourceId } });
    const staged = [...candidates, ...held.map(row => ({ ...row, companyId: originalSource.companyId }))];
    for (const companyId of [...new Set(staged.map(row => row.companyId!))]) {
      const companyRows = staged.filter(row => row.companyId === companyId), count = companyRows.length;
      const batchId = `drive-v7-invoice-${companyId}-${sha256.slice(0, 16)}`, versionId = `${sourceId}:${companyId}:${sha256.slice(0, 16)}`;
      await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      await tx.dataImportBatch.upsert({ where: { id: batchId }, update: {}, create: { id: batchId, companyId, name: "Revisi rekap invoice Drive 23 November 2026", status: "REVIEW", stats: { sourceRows: count, previousSha256, sha256, noFinancialPosting: true }, completedAt: new Date() } });
      await tx.sourceFile.upsert({ where: { id: versionId }, update: {}, create: { id: versionId, companyId, name: "00 Rekap List Invoice 2025-2026_Rev Alf.xlsx · revisi 23-Nov-2026", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", path: "KEUANGAN/INVOICE/versi-20261123", url: `https://drive.google.com/file/d/${sourceId}/view`, modifiedAt: new Date("2026-11-23T09:49:53.869Z"), sha256, status: "REVIEW", rowCount: count, notes: JSON.stringify({ headers: { "2026": prepared.headers }, previousSha256, sourceId, revisionOnly: true }) } });
      for (const row of companyRows) {
        const id = `${batchId}:${row.row}`;
        const issuerPending = held.some(h => h.row === row.row);
        await tx.sourceFact.upsert({ where: { id }, update: {}, create: { id, companyId, batchId, sourceKey: id, sourceFileId: versionId, kind: issuerPending ? "CONTROL" : "FINANCIAL_SOURCE", sheet: "2026", row: row.row, documentNumber: row.documentNumber, effectiveDate: row.effectiveDate ? new Date(row.effectiveDate + "T00:00:00Z") : null, amount: row.amount, status: "UNMATCHED", data: json({ ...row.data, issuerPending, reviewOnly: true, sourceRevision: sha256, previousSha256 }) } });
      }
      if (!(await tx.auditEvent.count({ where: { companyId, action: "SOURCE_REVISION_STAGED", entityId: batchId } }))) await tx.auditEvent.create({ data: { companyId, action: "SOURCE_REVISION_STAGED", entityId: batchId, details: { sourceRows: count, sha256, previousSha256, noFinancialPosting: true } } });
    }
  }, { timeout: 120000 });
  console.log(JSON.stringify(summary));
} finally { await db.$disconnect(); }
