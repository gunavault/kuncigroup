import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { signedCents } from "../src/lib/money";
const schema = `trace_${randomUUID().replaceAll("-", "")}`, url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema); process.env.DATABASE_URL = url.toString();
const client = new pg.Client({ connectionString: url.toString() });
await client.connect(); await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
for (const dir of readdirSync("prisma/migrations").filter(d => /^\d/.test(d)).sort()) await client.query(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
const { db } = await import("../src/lib/db");
const { financialTrace, safeEvidenceUrl } = await import("../src/lib/financial-trace");
const { financialRatios, ratioValue } = await import("../src/lib/financial-ratios");
const { createJournal, concludeDraft, postDraft, reports, insert, closePeriod } = await import("../src/lib/accounting");
const { transitionRecord } = await import("../src/lib/operations/engine");
const { finalizationStatus, updateFinalization, assertCloseAllowed } = await import("../src/lib/finalization");
type Actor = import("../src/lib/auth").Actor;
const actor = (id: string, role: import("@prisma/client").Role, companyId = "A", branches: string[] = []): Actor => ({ id, name: id, email: `${id}@example.test`, superuser: false, mustChangePassword: false, grants: [{ companyId, role, branchIds: branches }] });
const finance = actor("finance", "FINANCE"), reviewer = actor("reviewer", "FINANCE"), admin = actor("admin", "ADMIN"), director = actor("director", "DIRECTOR");
await db.company.createMany({ data: [{ id: "A", code: "A", name: "Company A" }, { id: "B", code: "B", name: "Company B" }] });
await db.fiscalPeriod.createMany({ data: ["A", "B"].map(id => ({ id, companyId: id, name: "2032", startDate: new Date("2032-01-01Z"), endDate: new Date("2032-12-31Z") })) });
for (const [id, code, category, isCash, role] of [["cash", "100", "ASET", true, null], ["ar", "110", "ASET", false, null], ["ap", "200", "KEWAJIBAN", false, null], ["equity", "300", "EKUITAS", false, "CAPITAL"], ["drawings", "310", "EKUITAS", false, "DRAWINGS"], ["revenue", "400", "PENDAPATAN", false, null], ["cogs", "500", "BEBAN", false, null], ["expense", "600", "BEBAN", false, null]] as const)
  await db.account.create({ data: { id, code, name: id, category, isCash, role, normalBalance: ["ASET", "BEBAN"].includes(category) ? "DEBIT" : "KREDIT" } });
const line = (accountId: string, debit: string, credit: string) => ({ accountId, debit, credit });
const base = { periodId: "A", date: "2032-01-10", type: "GENERAL", description: "Trace test", cashActivity: "OPERATING" };
await createJournal({ ...base, date: "2032-01-01", type: "OPENING", lines: [line("cash", "1000", "0"), line("equity", "0", "1000")] }, finance.id);
const entries: Awaited<ReturnType<typeof createJournal>>[] = [];
for (let i = 0; i < 60; i++) entries.push(await createJournal({ ...base, lines: [line("cash", "0.01", "0"), line("revenue", "0", "0.01")] }, finance.id));
await createJournal({ ...base, lines: [line("ar", "100", "0"), line("revenue", "0", "100")] });
await createJournal({ ...base, lines: [line("cogs", "120.50", "0"), line("cash", "0", "120.50")] });
await createJournal({ ...base, lines: [line("expense", "20.20", "0"), line("cash", "0", "20.20")] });
await createJournal({ ...base, cashActivity: "FINANCING", lines: [line("cash", "200", "0"), line("ap", "0", "200")] });
await createJournal({ ...base, cashActivity: "FINANCING", lines: [line("drawings", "50", "0"), line("cash", "0", "50")] });
await db.$transaction(tx => insert(tx, "A", new Date("2032-12-31Z"), "CLOSING", "Excluded closing", [line("revenue", "100.60", "0"), line("equity", "0", "100.60")]));
await db.dataImportBatch.createMany({ data: [{ id: "batch", companyId: "A", name: "Test" }, { id: "batchB", companyId: "B", name: "Test B" }] });
await db.sourceFile.createMany({ data: [{ id: "sourceA", companyId: "A", name: "Source A.xlsx", mime: "xlsx", path: "sourceA", url: "https://drive.google.com/file/d/test/view" }, { id: "sourceB", companyId: "B", name: "Private B.xlsx", mime: "xlsx", path: "sourceB", url: "https://example.test/private" }] });
await db.sourceFact.createMany({ data: [
  { id: "journal-source", companyId: "A", kind: "FINANCIAL_JOURNAL", batchId: "batch", sourceKey: "j1", sourceFileId: "sourceA", sheet: "JURNAL", row: 12, data: { accountCode: "400", "4": "PO-EXACT", ledger: { journalId: entries[0].id } } },
  { id: "cogs-map", companyId: "A", kind: "FINANCIAL_JOURNAL", batchId: "batch", sourceKey: "j2", sourceFileId: "sourceA", sheet: "JURNAL", row: 13, data: { accountCode: "500", "16": "HPP" } },
  { id: "source-note", companyId: "A", kind: "FINANCIAL_SOURCE", batchId: "batch", sourceKey: "note", sourceFileId: "sourceA", sheet: "PO", row: 20, documentNumber: "PO-EXACT" },
  { id: "foreign-note", companyId: "B", kind: "FINANCIAL_SOURCE", batchId: "batchB", sourceKey: "foreign", sourceFileId: "sourceB", sheet: "PO", row: 22, documentNumber: "PO-EXACT" },
] });
await db.businessRecord.createMany({ data: [
  { id: "invoice", companyId: "A", module: "sales", number: "INV-TEST", title: "Invoice", date: new Date("2032-01-10Z"), status: "POSTED", amount: "0.01", actorId: finance.id, journalId: entries[0].id, data: { orderId: "order" } },
  { id: "order", companyId: "A", module: "purchase", number: "PO-TEST", title: "Order", date: new Date("2032-01-10Z"), status: "APPROVED", actorId: finance.id },
  { id: "foreign", companyId: "B", module: "sales", number: "INV-B", title: "Foreign", date: new Date("2032-01-10Z"), actorId: finance.id },
  { id: "imported", companyId: "A", module: "sales", number: "IMPORTED", title: "Source only", date: new Date("2032-01-10Z"), status: "IMPORTED", actorId: finance.id },
] });

test("statements reconcile to all accounts and journal pages, including equity and classified cash flows", async () => {
  const r = await db.$transaction(tx => reports(tx, "A"));
  for (const [statement, metrics] of Object.entries({ BALANCE: { assets: r.assets, liabilities: r.liabilities, equity: r.equity }, PROFIT_LOSS: { revenue: r.revenue, expense: r.expense, profit: r.profit }, EQUITY: { capitalBefore: r.capitalBefore, drawings: r.drawings, profit: r.profit, equity: r.equity }, CASH_FLOW: r.cash })) {
    for (const [metric, expected] of Object.entries(metrics)) {
      const result = await financialTrace(finance, { company: "A", period: "A", statement, metric });
      assert.ok(result.level !== "DOCUMENT");
      assert.equal(result.value, expected, `${statement}/${metric}`);
      assert.equal(result.accounts.reduce((s, a) => s + signedCents(a.value), 0n), signedCents(expected));
    }
  }
  const request = { company: "A", period: "A", statement: "PROFIT_LOSS", metric: "revenue", account: "revenue" };
  let total = 0n;
  for (let page = 0; page < 3; page++) {
    const result = await financialTrace(finance, { ...request, page }); assert.ok(result.level !== "DOCUMENT");
    assert.equal(result.total, 61); assert.equal(result.value, "100.60");
    total += result.journals.reduce((s, j) => s + signedCents(j.contribution), 0n);
  }
  assert.equal(total, 10060n);
});
test("journal drill-down follows explicit source, invoice and PO; company and branch boundaries hold", async () => {
  const result = await financialTrace(finance, { company: "A", period: "A", statement: "PROFIT_LOSS", metric: "revenue", journal: entries[0].id });
  assert.equal(result.level, "JOURNAL"); if (result.level !== "JOURNAL") return;
  const journal = result.journals[0]; assert.equal(journal.lines.length, 2); assert.equal(journal.sources[0].row, 12);
  assert.deepEqual(journal.sourceDocuments.map(d => d.id), ["source-note"]); assert.equal(journal.documents[0].id, "invoice");
  const doc = await financialTrace(finance, { company: "A", period: "A", document: "invoice" }); assert.equal(doc.level, "DOCUMENT");
  if (doc.level === "DOCUMENT") assert.deepEqual(doc.related.map(d => d.id), ["order"]);
  for (const request of [{ company: "B", period: "B" }, { company: "A", period: "B" }, { company: "A", period: "A", document: "foreign" }, { company: "A", period: "A", statement: "BALANCE", metric: "assets", account: "revenue" }]) await assert.rejects(financialTrace(finance, request));
  await assert.rejects(financialTrace(actor("branch", "FINANCE", "A", ["branch"]), { company: "A", period: "A" }));
  await assert.rejects(financialTrace(actor("staff", "STAFF"), { company: "A", period: "A" }));
  assert.equal(safeEvidenceUrl("javascript:alert(1)"), null); assert.equal(safeEvidenceUrl("https://secret@example.test"), null); assert.equal(safeEvidenceUrl("file:///private"), null);
});
test("ratios retain integer precision, document basis and missing classifications; operational imports stay excluded", async () => {
  assert.equal(ratioValue(1n, 6n, true), "16.67"); assert.equal(ratioValue(-1n, 6n, true), "-16.67"); assert.equal(ratioValue(2n, 0n), null);
  const result = await financialRatios(finance, "A", "A"), find = (key: string) => result.ratios.find(r => r.key === key)!;
  assert.equal(find("current").value, null); assert.match(find("current").reason!, /Klasifikasi/);
  assert.equal(find("cashProfit").value, null); assert.match(find("cashProfit").reason!, /negatif/);
  assert.equal(find("roa").value, "-3.80"); assert.equal(find("workflowCompletion").value, "50.00");
  assert.ok(result.notes.some(n => n.startsWith("1 dokumen impor"))); assert.match(result.basis, /Tidak disetahunkan/);
  await db.company.update({ where: { id: "A" }, data: { settings: { accounting: { ratios: { currentAssetIds: ["cash", "ar"], currentLiabilityIds: ["ap"], quickAssetIds: ["cash", "ar"] } } } } });
  const mapped = await financialRatios(finance, "A", "A"); assert.equal(mapped.ratios.find(r => r.key === "current")!.value, "5.55");
  const empty = await financialRatios(actor("finB", "FINANCE", "B"), "B", "B"); assert.equal(empty.ratios.find(r => r.key === "netMargin")!.value, null);
});
test("reject/cancel retain drafts and audit, disallow self-rejection, posting terminal states and cross-company actions", async () => {
  const draft = () => createJournal({ ...base, status: "DRAFT", lines: [line("cash", "1", "0"), line("revenue", "0", "1")] }, finance.id);
  const rejected = await draft(); await assert.rejects(concludeDraft(finance, rejected.id, "reject", "Ditolak oleh diri sendiri"));
  await assert.rejects(concludeDraft(actor("foreign", "FINANCE", "B"), rejected.id, "reject", "Percobaan lintas perusahaan"));
  await concludeDraft(reviewer, rejected.id, "reject", "Bukti transaksi belum lengkap"); await assert.rejects(postDraft(rejected.id));
  const cancelled = await draft(); await assert.rejects(concludeDraft(reviewer, cancelled.id, "cancel", "Bukan pembuat dokumen"));
  await concludeDraft(finance, cancelled.id, "cancel", "Draft dibuat dua kali oleh pengaju"); await assert.rejects(postDraft(cancelled.id));
  assert.equal(await db.auditEvent.count({ where: { action: { in: ["JOURNAL_REJECTED", "JOURNAL_CANCELLED"] } } }), 2);
  await assert.rejects(concludeDraft(admin, entries[0].id, "cancel", "Jurnal posted tidak boleh dihapus"));
});
test("withdrawal resets OPS/approval stamps; approved documents can be rejected before effects", async () => {
  const record = await db.businessRecord.create({ data: { companyId: "A", module: "purchase", number: "WITHDRAW", title: "Pending", date: new Date("2032-01-10Z"), status: "SUBMITTED", actorId: "staff", data: { opsVerifiedBy: "ops", opsVerifiedAt: "2032-01-10", approvedName: "old", approvalTier: "MANAGER" } } });
  const go = (who: Actor, action: string, version = record.version) => transitionRecord(who, { companyId: "A", id: record.id, version, action, reason: "Pengajuan perlu diperbaiki" });
  await assert.rejects(go(actor("other", "STAFF"), "withdraw"));
  const withdrawn = await go(actor("staff", "STAFF"), "withdraw"); assert.equal(withdrawn.status, "DRAFT"); assert.equal((withdrawn.data as Record<string, unknown>).opsVerifiedBy, undefined);
  await assert.rejects(go(actor("staff", "STAFF"), "withdraw"));
  const approved = await db.businessRecord.findUniqueOrThrow({ where: { id: "order" } });
  await transitionRecord(director, { companyId: "A", id: approved.id, version: approved.version, action: "reject", reason: "PO belum memenuhi persyaratan" });
  assert.equal((await db.businessRecord.findUniqueOrThrow({ where: { id: approved.id } })).status, "REJECTED");
});
test("finalization supports reject, withdrawal, exception revocation and invalidates signoffs on ledger changes", async () => {
  const p = await db.fiscalPeriod.create({ data: { companyId: "A", name: "Finalization", startDate: new Date("2033-01-01Z"), endDate: new Date("2033-01-31Z") } });
  await db.company.update({ where: { id: "A" }, data: { settings: { historicalLedger: { periodId: p.id, from: "2033-01-01", through: "2033-01-31", source: "Test" } } } });
  const go = (who: Actor, action: string, role?: string) => updateFinalization(who, "A", { action, periodId: p.id, role, note: "Diperiksa dan dicatat dengan alasan yang lengkap" });
  await go(finance, "signoff", "FINANCE"); await go(director, "reject"); assert.equal((await finalizationStatus("A", p.id)).signoffs.length, 0);
  await go(finance, "signoff", "FINANCE"); await go(director, "signoff", "DIRECTOR"); await go(finance, "withdrawSignoff", "FINANCE"); assert.equal((await finalizationStatus("A", p.id)).signoffs.length, 0);
  await go(director, "exception"); await go(director, "revokeException"); assert.equal((await finalizationStatus("A", p.id)).exception, null);
  await go(finance, "signoff", "FINANCE"); await go(director, "signoff", "DIRECTOR"); await assertCloseAllowed(p.id);
  await createJournal({ ...base, periodId: p.id, date: "2033-01-10", lines: [line("cash", "1", "0"), line("revenue", "0", "1")] }, finance.id);
  const stale = await finalizationStatus("A", p.id); assert.equal(stale.signoffs.length, 0); assert.equal(stale.staleSignoffs, 2);
  await assert.rejects(assertCloseAllowed(p.id)); await assert.rejects(closePeriod(p.id), /belum dapat ditutup/);
  await assert.rejects(go(actor("otherB", "ADMIN", "B"), "exception"));
});
after(async () => { await db.$disconnect(); await client.query(`DROP SCHEMA "${schema}" CASCADE`); await client.end(); });
