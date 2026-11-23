// Posts the KBA 2026 working-paper journal (sheet JURNAL) to the ledger, in one transaction.
//   npx tsx scripts/post-working-paper-kba-2026.ts            # dry run: plan + checks
//   npx tsx scripts/post-working-paper-kba-2026.ts --apply    # write
// Effects with --apply:
// - adds suspense accounts 99901–99903 (from the working paper) to the COA,
// - creates the open KBA period "Januari–Oktober 2026 (kertas kerja)",
// - posts each voucher through accounting.insert (balance, active-account and cash-flow rules apply),
// - links source facts to their journals and records settings.historicalLedger on the company,
//   which blocks reposting operational documents dated within that window (no double counting).
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { insert } from "../src/lib/accounting";
import { planVouchers, SUSPENSE_ACCOUNTS, type FactLine } from "../src/lib/working-paper-ledger";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const companyId = "KBA";
const START = new Date("2026-01-01T00:00:00Z"), END = new Date("2026-10-31T00:00:00Z");
const PERIOD_NAME = "Januari s.d. Oktober 2026 (kertas kerja)";
const SOURCE = "Kertas Kerja Akuntansi KBA 2026, sheet JURNAL";
const actorId = "system:kertas-kerja-kba-2026";
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
if (obj(company.settings).historicalLedger) {
  console.log(JSON.stringify({ status: "ALREADY_POSTED", historicalLedger: obj(company.settings).historicalLedger }, null, 2));
  process.exit(0);
}
const facts = await db.sourceFact.findMany({ where: { companyId, kind: "FINANCIAL_JOURNAL" }, orderBy: [{ effectiveDate: "asc" }, { row: "asc" }] });
const accounts = await db.account.findMany();
const cashCodes = new Set(accounts.filter((a) => a.isCash).map((a) => a.code));
const lines: FactLine[] = facts.map((f) => {
  const d = obj(f.data);
  return {
    documentNumber: String(f.documentNumber),
    date: f.effectiveDate!.toISOString().slice(0, 10),
    accountCode: String(d.accountCode),
    debit: f.debit?.toString() ?? "0",
    credit: f.credit?.toString() ?? "0",
    description: String(d.description ?? d["7"] ?? ""),
    title: String(d["3"] ?? ""),
    estimate: d.containsEstimate === true,
    cashTag: d["12"] ? String(d["12"]) : undefined,
  };
});
const { vouchers, problems } = planVouchers(lines, cashCodes);
const known = new Set([...accounts.map((a) => a.code), ...SUSPENSE_ACCOUNTS.map((s) => s.code)]);
const unknownCodes = [...new Set(vouchers.flatMap((v) => v.lines.map((l) => l.accountCode)).filter((c) => !known.has(c)))];
const outside = vouchers.filter((v) => new Date(v.date + "T00:00:00Z") < START || new Date(v.date + "T00:00:00Z") > END).map((v) => v.number);
const overlapping = await db.fiscalPeriod.findMany({ where: { companyId, startDate: { lte: END }, endDate: { gte: START } } });
const sum = (k: "debit" | "credit") => vouchers.flatMap((v) => v.lines).reduce((s, l) => s + Math.round(Number(l[k]) * 100), 0) / 100;
const summary = {
  mode: apply ? "APPLY" : "DRY_RUN",
  sourceLines: facts.length,
  vouchers: vouchers.length,
  byType: Object.fromEntries(["OPENING", "ADJUSTING", "GENERAL"].map((t) => [t, vouchers.filter((v) => v.type === t).length])),
  byCashActivity: Object.fromEntries(["OPERATING", "INVESTING", "FINANCING"].map((t) => [t, vouchers.filter((v) => v.cashActivity === t).length])),
  estimateVouchers: vouchers.filter((v) => v.estimate).map((v) => v.number),
  totalDebit: sum("debit"),
  totalCredit: sum("credit"),
  problems,
  unknownCodes,
  outsideWindow: outside,
  overlappingPeriods: overlapping.map((p) => p.name),
};
const blocking = problems.filter((p) => !p.includes("dilewati")).length || unknownCodes.length || outside.length || overlapping.length;
console.log(JSON.stringify(summary, null, 2));
if (!apply) process.exit(blocking ? 1 : 0);
if (blocking) throw new Error("Pemeriksaan pra-posting gagal; tidak ada yang ditulis.");

await db.$transaction(async (tx) => {
  for (const s of SUSPENSE_ACCOUNTS)
    await tx.account.upsert({ where: { code: s.code }, update: {}, create: { code: s.code, name: s.name, category: s.category, normalBalance: s.normalBalance } });
  const all = await tx.account.findMany();
  const byCode = new Map(all.map((a) => [a.code, a.id]));
  const period = await tx.fiscalPeriod.create({ data: { companyId, name: PERIOD_NAME, startDate: START, endDate: END } });
  const posted: Record<string, { id: string; number: string }> = {};
  for (const v of vouchers) {
    const entry = await insert(tx, period.id, new Date(v.date + "T00:00:00Z"), v.type, v.description,
      v.lines.map((l) => ({ accountId: byCode.get(l.accountCode)!, debit: l.debit, credit: l.credit, description: l.description })),
      { actorId, ...(v.cashActivity ? { cashActivity: v.cashActivity } : {}) });
    posted[v.number] = { id: entry.id, number: entry.journalNumber };
  }
  for (const f of facts) {
    const p = posted[String(f.documentNumber)];
    if (p) await tx.sourceFact.update({ where: { id: f.id }, data: { data: { ...obj(f.data), basis: "DIPOSTING_BUKU_BESAR", ledger: { journalId: p.id, journalNumber: p.number } } as Prisma.InputJsonValue } });
  }
  await tx.company.update({ where: { id: companyId }, data: { settings: { ...obj(company.settings), historicalLedger: {
    from: "2026-01-01", through: "2026-10-31", periodId: period.id, source: SOURCE, vouchers: vouchers.length,
    postedAt: new Date().toISOString(), note: "Belum diaudit. Estimasi dan akun penampung mengikuti kertas kerja; lihat temuan TEMUAN.",
  } } as Prisma.InputJsonValue } });
  await tx.auditEvent.create({ data: { companyId, actorId, action: "WORKING_PAPER_POSTED", entityId: period.id, details: { vouchers: vouchers.length, source: SOURCE } } });
}, { timeout: 30 * 60000, maxWait: 60000 });
console.log("POSTED", vouchers.length, "vouchers");
await db.$disconnect();
