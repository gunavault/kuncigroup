// Imports tender budgets (RAB) per site as BUDGET_RAB source facts, for budget-versus-actual by site.
//   npx tsx scripts/import-rab-budget.ts --file data/rab/<file>.json [--apply]
// Input (private, git-ignored): { company, budgets: [{ site, driveId, file, lines: [{ category, label, monthly }] }] }
// category: CHEMICAL | CONSUMABLE | EQUIPMENT | LABOR. "site" must equal the site name used in the working paper.
// Dry-run by default; re-running replaces the facts of the same Drive file. No journal is created.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { cents } from "../src/lib/money";

const i = process.argv.indexOf("--file"), file = i > 0 ? process.argv[i + 1] : undefined;
if (!file) throw new Error("Wajib: --file");
const apply = process.argv.includes("--apply");
type Input = { company: string; budgets: { site: string; driveId: string; file: string; lines: { category: string; label: string; monthly: string }[] }[] };
const input = JSON.parse(readFileSync(file, "utf8")) as Input;
const categories = new Set(["CHEMICAL", "CONSUMABLE", "EQUIPMENT", "LABOR"]);
const company = await db.company.findUnique({ where: { id: input.company } });
if (!company) throw new Error("Perusahaan tidak ditemukan.");
const sites = new Set((await db.$queryRaw<{ s: string }[]>`SELECT DISTINCT data->>'13' AS s FROM source_facts WHERE "companyId"=${input.company} AND kind='FINANCIAL_JOURNAL'`).map((x) => x.s));
for (const b of input.budgets) {
  if (!sites.has(b.site)) throw new Error(`Site "${b.site}" tidak ada di kertas kerja; samakan penulisan site.`);
  for (const l of b.lines) {
    if (!categories.has(l.category)) throw new Error(`Kategori tidak dikenal: ${l.category}`);
    if (cents(l.monthly) <= 0n) throw new Error(`Nilai per bulan ${b.site}/${l.label} harus positif.`);
  }
}
const summary = input.budgets.map((b) => ({ site: b.site, file: b.file, lines: b.lines.length }));
if (!apply) {
  console.log(JSON.stringify({ mode: "DRY_RUN", company: input.company, budgets: summary }, null, 2));
  process.exit(0);
}
await db.$transaction(async (tx) => {
  const batchId = `rab-${input.company}`;
  await tx.dataImportBatch.upsert({ where: { id: batchId }, create: { id: batchId, companyId: input.company, name: "RAB tender per site", status: "IMPORTED", completedAt: new Date() }, update: { status: "IMPORTED", completedAt: new Date() } });
  for (const b of input.budgets) {
    const sourceFileId = `rab-${b.driveId}`;
    await tx.sourceFile.upsert({
      where: { id: sourceFileId },
      create: { id: sourceFileId, companyId: input.company, name: b.file, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", path: `Google Drive / ${b.file}`, url: `https://drive.google.com/file/d/${b.driveId}/view`, status: "IMPORTED", rowCount: b.lines.length, notes: JSON.stringify({ kind: "BUDGET_RAB", site: b.site }) },
      update: { name: b.file, url: `https://drive.google.com/file/d/${b.driveId}/view`, status: "IMPORTED", rowCount: b.lines.length },
    });
    await tx.sourceFact.deleteMany({ where: { companyId: input.company, sourceFileId, kind: "BUDGET_RAB" } });
    await tx.sourceFact.createMany({
      data: b.lines.map((l, n) => ({
        id: `${sourceFileId}:${n + 1}`, companyId: input.company, batchId, kind: "BUDGET_RAB", sourceKey: `${sourceFileId}:${n + 1}`, sourceFileId, sheet: "RAB", row: n + 1,
        amount: l.monthly, status: "VALIDATED", data: { site: b.site, category: l.category, label: l.label, monthly: l.monthly } as Prisma.InputJsonValue,
      })),
    });
  }
  await tx.auditEvent.create({ data: { companyId: input.company, action: "BUDGET_RAB_IMPORTED", entityId: `rab-${input.company}`, details: { budgets: summary } as Prisma.InputJsonValue } });
});
console.log(JSON.stringify({ mode: "APPLIED", company: input.company, budgets: summary }, null, 2));
await db.$disconnect();
