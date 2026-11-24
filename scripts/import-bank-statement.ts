// Imports a Finance "Jurnal rekening koran" workbook (Google Drive text export) as BANK_STATEMENT
// source facts for one company bank account, so the app can reconcile statement lines to the ledger.
//   npx tsx scripts/import-bank-statement.ts --file data/bank/<file>.drive.json --company KBA --account 11107 \
//       --bank "Mandiri KBA operasional" --drive-id <id> [--apply]
// Dry-run by default. Re-running replaces the facts of the same Drive file (idempotent).
// Input files hold bank data and live under data/ (git-ignored); they are never committed.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { amount } from "../src/lib/money";
import { parseStatementText, continuityBreaks } from "../src/lib/bank-statement";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const file = arg("file"), companyId = arg("company"), accountCode = arg("account"), bank = arg("bank"), driveId = arg("drive-id");
if (!file || !companyId || !accountCode || !bank || !driveId) throw new Error("Wajib: --file --company --account --bank --drive-id");
const apply = process.argv.includes("--apply");
const raw = readFileSync(file, "utf8");
const parsed = (() => { try { return JSON.parse(raw) as { fileContent: string; title?: string; viewUrl?: string }; } catch { return { fileContent: raw }; } })();
const sections = parseStatementText(parsed.fileContent);
if (!sections.length) throw new Error("Tidak ada baris rekening koran yang terbaca.");
const account = await db.account.findUnique({ where: { code: accountCode } });
if (!account?.isCash) throw new Error(`Akun ${accountCode} bukan akun kas/bank.`);
const company = await db.company.findUnique({ where: { id: companyId } });
if (!company) throw new Error("Perusahaan tidak ditemukan.");
const months = sections.map((s) => s.month);
if (new Set(months).size !== months.length) throw new Error("Satu bulan muncul di lebih dari satu sheet; periksa sumber.");

const sourceFileId = `bank-${driveId}`, batchId = `bank-${driveId}`;
const breaks = continuityBreaks(sections);
const summary = {
  file: parsed.title ?? file, account: accountCode, bank, months: sections.length,
  lines: sections.reduce((s, x) => s + x.lines.length, 0),
  rowBreaks: sections.flatMap((s) => s.breaks.map((b) => ({ month: s.month, row: b.row, printed: amount(b.printed), computed: amount(b.computed) }))),
  titleMismatch: sections.filter((s) => s.titleMismatch).map((s) => `${s.title} berisi ${s.month}`),
  continuity: breaks.map((b) => ({ from: b.from, to: b.to, closing: amount(b.closing), opening: amount(b.opening), difference: amount(b.difference) })),
  perMonth: sections.map((s) => ({ month: s.month, opening: s.opening === null ? null : amount(s.opening), inflow: amount(s.inflow), outflow: amount(s.outflow), closing: s.closing === null ? null : amount(s.closing) })),
};
if (!apply) {
  console.log(JSON.stringify({ mode: "DRY_RUN", ...summary }, null, 2));
  process.exit(0);
}
const sha256 = createHash("sha256").update(parsed.fileContent).digest("hex");
await db.$transaction(async (tx) => {
  await tx.dataImportBatch.upsert({
    where: { id: batchId },
    create: { id: batchId, companyId, name: `Rekening koran ${bank}`, status: "IMPORTED", stats: summary as unknown as Prisma.InputJsonValue, completedAt: new Date() },
    update: { status: "IMPORTED", stats: summary as unknown as Prisma.InputJsonValue, completedAt: new Date() },
  });
  await tx.sourceFile.upsert({
    where: { id: sourceFileId },
    create: { id: sourceFileId, companyId, name: parsed.title ?? file, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", path: `Google Drive / ${parsed.title ?? file}`, url: parsed.viewUrl ?? "", sha256, status: "IMPORTED", rowCount: summary.lines, notes: JSON.stringify({ kind: "BANK_STATEMENT", account: accountCode, bank }) },
    update: { name: parsed.title ?? file, url: parsed.viewUrl ?? "", sha256, status: "IMPORTED", rowCount: summary.lines, notes: JSON.stringify({ kind: "BANK_STATEMENT", account: accountCode, bank }) },
  });
  await tx.sourceFact.deleteMany({ where: { companyId, sourceFileId, kind: { in: ["BANK_STATEMENT", "BANK_STATEMENT_PERIOD"] } } });
  const facts: Prisma.SourceFactCreateManyInput[] = [];
  for (const s of sections) {
    facts.push({
      id: `${sourceFileId}:${s.month}:0`, companyId, batchId, kind: "BANK_STATEMENT_PERIOD", sourceKey: `${sourceFileId}:${s.month}:period`, sourceFileId,
      sheet: s.title, row: 0, effectiveDate: new Date(`${s.month}-01T00:00:00Z`), accountId: account.id, status: "VALIDATED",
      data: { month: s.month, accountCode, bank, opening: s.opening === null ? null : amount(s.opening), closing: s.closing === null ? null : amount(s.closing), inflow: amount(s.inflow), outflow: amount(s.outflow), titleMismatch: s.titleMismatch, rowBreaks: s.breaks.length } as Prisma.InputJsonValue,
    });
    for (const l of s.lines)
      facts.push({
        id: `${sourceFileId}:${s.month}:${l.row}`, companyId, batchId, kind: "BANK_STATEMENT", sourceKey: `${sourceFileId}:${s.month}:${l.row}`, sourceFileId,
        sheet: s.title, row: l.row, effectiveDate: new Date(`${l.date}T00:00:00Z`), accountId: account.id,
        debit: amount(l.inflow), credit: amount(l.outflow), amount: amount(l.balance), status: "VALIDATED",
        data: { accountCode, bank, description: l.description, printedBalance: amount(l.balance), computedBalance: amount(l.computedBalance) } as Prisma.InputJsonValue,
      });
  }
  await tx.sourceFact.createMany({ data: facts });
  await tx.auditEvent.create({ data: { companyId, action: "BANK_STATEMENT_IMPORTED", entityId: sourceFileId, details: { account: accountCode, bank, lines: summary.lines, months: summary.months, sha256 } } });
}, { timeout: 120000 });
console.log(JSON.stringify({ mode: "APPLIED", ...summary, perMonth: undefined }, null, 2));
await db.$disconnect();
