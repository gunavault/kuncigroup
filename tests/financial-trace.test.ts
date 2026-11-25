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
  await createJournal({ ...base, periodId: p.id, date: "2033-01-01", type: "OPENING", lines: [line("cash", "0.01", "0"), line("equity", "0", "0.01")] }, finance.id);
  const { saveServicePlan, emptyServicePlan, calkSections } = await import('../src/lib/service-plans');
  await saveServicePlan(finance, { ...emptyServicePlan(), companyId: 'A', periodId: p.id, framework: 'SAK_EP', frameworkEvidence: 'Dasar kebijakan hanya untuk fixture uji terisolasi', notes: Object.fromEntries(calkSections.map(([key]) => [key, 'Catatan uji terisolasi untuk kebutuhan finalisasi.'])) });
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
test("automatic ratio proposals need Finance review, and bank-period coverage needs explicit confirmation", async () => {
  const { saveRatioMapping } = await import('../src/lib/ratio-mapping-review');
  const { reviewSource } = await import('../src/lib/operations/source-data');
  const mapping = { currentAssetIds: ['cash', 'ar'], currentLiabilityIds: ['ap'], quickAssetIds: ['cash', 'ar'] };
  const company = await db.company.findUniqueOrThrow({where:{id:'A'}});
  await db.company.update({where:{id:'A'},data:{settings:{...(company.settings as Record<string, never>),accounting:{ratios:mapping}}}});
  await db.auditEvent.create({data:{companyId:'A',action:'RATIO_MAPPING_AUTO',entityId:'A',details:{mapping}}});
  const pending = await financialRatios(finance,'A','A'); assert.equal(pending.mappingPending,true);const provisional=pending.ratios.find(r=>r.key==='current')!;assert.notEqual(provisional.value,null,'an unreviewed proposal still shows a value');assert.equal(provisional.provisional,true,'...flagged as provisional');assert.match(provisional.reason??'',/belum ditinjau/);
  const input={companyId:'A',mapping,confirmed:true,note:'Klasifikasi diuji dalam fixture terisolasi'};
  await assert.rejects(saveRatioMapping(actor('staff','STAFF'),input));
  await assert.rejects(saveRatioMapping(finance,{...input,confirmed:false}));
  await saveRatioMapping(finance,input);
  const reviewed=await financialRatios(finance,'A','A');assert.equal(reviewed.mappingPending,false);assert.equal(reviewed.ratios.find(r=>r.key==='current')!.value,'5.55');assert.ok(!reviewed.ratios.find(r=>r.key==='current')!.provisional,'reviewed mapping is final');
  await db.sourceFact.create({data:{id:'bank-month',companyId:'A',kind:'BANK_STATEMENT_PERIOD',batchId:'batch',sourceKey:'bank-month',sourceFileId:'sourceA',sheet:'BANK',row:0,data:{month:'2032-01',opening:'0.00',closing:'0.00'}}});
  const review={companyId:'A',id:'bank-month',note:'Kelengkapan koran bulan ini diuji pada fixture',decision:'REVIEW'};
  await assert.rejects(reviewSource(actor('manager','MANAGER'),{...review,confirmCoverage:true}));
  await assert.rejects(reviewSource(finance,review));
  const count=await db.journalEntry.count();await reviewSource(finance,{...review,confirmCoverage:true});assert.equal(await db.journalEntry.count(),count);
  assert.equal(((await db.sourceFact.findUniqueOrThrow({where:{id:'bank-month'}})).data as Record<string,unknown>).coverageConfirmed,true);
});
test("service reports reconcile as-of aging, source ledger cards, site allocation, plans and untouched journals", async () => {
  const { serviceReport, ageBucket } = await import('../src/lib/service-report');
  const { saveServicePlan, emptyServicePlan, calkSections } = await import('../src/lib/service-plans');
  const { ledgerOverview } = await import('../src/lib/operations/ledger-overview');
  const { moduleMiniDashboard } = await import('../src/lib/operations/mini-dashboard');
  const { saveRatioMapping } = await import('../src/lib/ratio-mapping-review');
  const p = await db.fiscalPeriod.create({ data: { companyId: 'A', name: 'Januari 2034', startDate: new Date('2034-01-01Z'), endDate: new Date('2034-01-31Z') } });
  const feb = await db.fiscalPeriod.create({ data: { companyId: 'A', name: 'Februari 2034', startDate: new Date('2034-02-01Z'), endDate: new Date('2034-02-28Z') } });
  await db.masterRecord.createMany({data:[{id:'svc-a',companyId:'A',kind:'PROJECT',code:'SVC-A',name:'Site A'},{id:'svc-b',companyId:'A',kind:'PROJECT',code:'SVC-B',name:'Site B'},{id:'svc-foreign',companyId:'B',kind:'PROJECT',code:'SVC-F',name:'Foreign site'}]});
  await db.account.create({data:{id:'advance',code:'120',name:'Kasbon uji',category:'ASET',normalBalance:'DEBIT'}});
  const company = await db.company.findUniqueOrThrow({where:{id:'A'}}), settings=company.settings as Record<string, unknown>;
  await db.company.update({where:{id:'A'},data:{settings:{...settings,accounting:{receivable:'ar',payable:'ap',advance:'advance'}}}});
  await saveRatioMapping(finance,{companyId:'A',confirmed:true,note:'Klasifikasi akun untuk fixture siklus jasa',mapping:{chemicalExpenseIds:['expense'],laborExpenseIds:['cogs']}});
  const journal=(lines:ReturnType<typeof line>[],date='2034-01-10',periodId=p.id,type='GENERAL')=>createJournal({...base,periodId,date,type,lines},finance.id);
  await journal([line('cash','100','0'),line('equity','0','100')],'2034-01-01',p.id,'OPENING');
  const invoice=await journal([line('ar','120','0'),line('revenue','0','120')]);
  const receipt=await journal([line('cash','50','0'),line('ar','0','50')],'2034-01-15');
  await journal([line('ar','20','0'),line('revenue','0','20')]);
  const chemical=await journal([line('expense','60','0'),line('cash','0','60')]);
  await journal([line('cogs','30','0'),line('cash','0','30')]);
  const future=await journal([line('cash','20','0'),line('ar','0','20')],'2034-02-15',feb.id);
  await db.businessRecord.createMany({data:[
    {id:'svc-inv',companyId:'A',module:'sales',number:'SVC-INV',title:'Invoice jasa',date:new Date('2034-01-10Z'),status:'POSTED',actorId:finance.id,journalId:invoice.id,amount:'120',settled:'70',data:{documentType:'INVOICE',dueDate:'2034-01-10',projectId:'svc-a'}},
    {id:'svc-pay',companyId:'A',module:'payments',number:'SVC-PAY',title:'Pembayaran',date:new Date('2034-01-15Z'),status:'POSTED',actorId:finance.id,journalId:receipt.id,amount:'50',data:{direction:'RECEIVE',referenceId:'svc-inv'}},
    {id:'svc-future',companyId:'A',module:'payments',number:'SVC-FUTURE',title:'Pembayaran berikutnya',date:new Date('2034-02-15Z'),status:'POSTED',actorId:finance.id,journalId:future.id,amount:'20',data:{direction:'RECEIVE',referenceId:'svc-inv'}},
  ]});
  const before=await serviceReport(finance,'A',p.id);
  assert.equal(before.aging.ar.ledger,'90.00');assert.equal(before.aging.ar.detailTotal,'70.00');assert.equal(before.aging.ar.unallocated,'20.00');
  assert.equal(before.aging.ar.rows[0].paid,'50.00','later payment and current settled field do not affect the as-of schedule');assert.equal(before.aging.ar.rows[0].bucket,'1_30');
  assert.equal(before.cash.opening,'60.00');assert.equal(before.cash.complete,false);assert.equal(before.plan.framework,'UNCONFIRMED');
  assert.equal(ageBucket('',p.endDate.toISOString().slice(0,10)),'UNKNOWN');assert.equal(ageBucket('2034-02-31','2034-01-31'),'UNKNOWN');
  const overview=await ledgerOverview(finance,'A',undefined,p.id);assert.equal(overview.revenue,'140.00');assert.equal(overview.receivable,'90.00');assert.equal(overview.advance,'0.00');
  assert.equal((await ledgerOverview(actor('staff','STAFF'),'A')).eligible,false);assert.equal((await ledgerOverview(actor('scoped','FINANCE','A',['branch']),'A')).eligible,false);
  const cards=await moduleMiniDashboard(finance,'A','sales',{periodId:p.id});assert.equal(cards.cards.find(c=>c.key==='outstanding')!.value,'90.00');
  const counts=await db.journalEntry.count(), original=JSON.stringify(await db.journalEntry.findUniqueOrThrow({where:{id:chemical.id},include:{lines:true}}));
  const costLine=chemical.lines.find(l=>l.accountId==='expense')!.id;
  const plan={...emptyServicePlan(),companyId:'A',periodId:p.id,framework:'SAK_EP',frameworkEvidence:'Kebijakan pelaporan khusus fixture pengujian',notes:Object.fromEntries(calkSections.map(([key])=>[key,'Catatan sumber fixture untuk pengujian fungsional.'])),budgets:[{projectId:'svc-a',category:'CHEMICAL',amount:'40.00',evidence:'RAB uji yang disetujui'}],cashPlans:[{date:'2034-02-01',direction:'OUT',category:'PAYROLL',projectId:'',amount:'100.00',evidence:'Payroll bruto dalam fixture'},{date:'2034-02-02',direction:'IN',category:'COLLECTION',projectId:'',amount:'50.00',evidence:'Jadwal penagihan fixture'}],allocations:[{lineId:costLine,projectId:'svc-a',amount:'30.00',evidence:'Bukti pemakaian chemical site A'},{lineId:costLine,projectId:'svc-b',amount:'30.00',evidence:'Bukti pemakaian chemical site B'}]};
  await assert.rejects(saveServicePlan(actor('staff','STAFF'),plan));
  await assert.rejects(saveServicePlan(finance,{...plan,allocations:[{...plan.allocations[0],amount:'60.01'}]}));
  await assert.rejects(saveServicePlan(finance,{...plan,budgets:[{...plan.budgets[0],projectId:'svc-foreign'}]}));
  await assert.rejects(saveServicePlan(finance,{...plan,cashPlans:[{...plan.cashPlans[0],date:'2034-01-20'}]}));
  await saveServicePlan(finance,plan);await assert.rejects(saveServicePlan(finance,plan),/berubah/);
  const afterReport=await serviceReport(finance,'A',p.id);assert.equal(afterReport.sites.reduce((sum,s)=>sum+signedCents(s.profit),0n),5000n);
  assert.equal(afterReport.sites.find(s=>s.id==='svc-b')!.profit,'-30.00');assert.equal(afterReport.budgets[0].actual,'30.00');assert.equal(afterReport.budgets[0].variance,'10.00');
  assert.equal(afterReport.labor.cost,'30.00');assert.equal(afterReport.labor.ratio,'21.43');assert.equal(afterReport.cash.plans[0].shortfall,'40.00');assert.equal(afterReport.cash.plans[1].balance,'10.00');
  assert.equal(await db.journalEntry.count(),counts);assert.equal(JSON.stringify(await db.journalEntry.findUniqueOrThrow({where:{id:chemical.id},include:{lines:true}})),original,'analytical allocation never edits the posted journal');
  await assert.rejects(serviceReport(finance,'B',p.id));await assert.rejects(serviceReport(actor('scoped','FINANCE','A',['branch']),'A',p.id));
  await db.fiscalPeriod.update({where:{id:p.id},data:{status:'CLOSED'}});await assert.rejects(saveServicePlan(finance,{...plan,version:1}),/ditutup/);
});
after(async () => { await db.$disconnect(); await client.query(`DROP SCHEMA "${schema}" CASCADE`); await client.end(); });

test("working-paper analysis: site P&L and invoice ageing reconcile to the ledger without estimates", async () => {
  const { serviceReport } = await import('../src/lib/service-report');
  const { sourceCents, ageSinceInvoice } = await import('../src/lib/working-paper-analysis');
  assert.equal(sourceCents(123456789.2), 12345678920n); assert.equal(sourceCents(""), null); assert.equal(sourceCents("abc"), null);
  assert.deepEqual(ageSinceInvoice('2035-01-01', '2035-04-15'), { days: 104, bucket: 'OVER_90' });
  const p = await db.fiscalPeriod.create({ data: { companyId: 'A', name: 'Januari 2035', startDate: new Date('2035-01-01Z'), endDate: new Date('2035-01-31Z') } });
  await db.account.create({ data: { id: 'piutang-wp', code: '115', name: 'Piutang Usaha uji', category: 'ASET', normalBalance: 'DEBIT' } });
  const j = (date: string, lines: ReturnType<typeof line>[]) => createJournal({ ...base, periodId: p.id, date, lines }, finance.id);
  const sale1 = await j('2035-01-05', [line('piutang-wp', '300', '0'), line('revenue', '0', '300')]);
  await j('2035-01-20', [line('cash', '300', '0'), line('piutang-wp', '0', '300')]);
  const sale2 = await j('2035-01-10', [line('piutang-wp', '200.10', '0'), line('revenue', '0', '200.10')]);
  const cost = await j('2035-01-12', [line('cogs', '100', '0'), line('cash', '0', '100')]);
  const office = await j('2035-01-13', [line('expense', '50', '0'), line('cash', '0', '50')]);
  const fact = (id: string, journalId: string, code: string, site: string, debit: string, credit: string) => ({ id, companyId: 'A', kind: 'FINANCIAL_JOURNAL', batchId: 'batch', sourceKey: id, sourceFileId: 'sourceA', sheet: 'JURNAL', row: 900 + Number(id.slice(-1)), debit, credit, data: { accountCode: code, '13': site, ledger: { journalId } } });
  const cell = (id: string, sheet: string, row: number, cells: Record<string, string | number>) => ({ id, companyId: 'A', kind: 'REFERENCE', batchId: 'batch', sourceKey: id, sourceFileId: 'sourceA', sheet, row, data: { cells } });
  await db.sourceFact.createMany({ data: [
    fact('wp-1', sale1.id, '400', 'Site X', '0', '300'), fact('wp-2', sale2.id, '400', 'Site Y', '0', '200.10'), fact('wp-3', cost.id, '500', 'Site X', '100', '0'), fact('wp-4', office.id, '600', 'Kantor pusat/umum', '50', '0'),
    cell('inv-1', 'INV', 5, { 2: 'KBA/INV/X-1', 3: '2035-01-05T00:00:00.000Z', 5: 'Pelanggan X', 24: 'Site X', 12: 300, 13: '2035-01-20T00:00:00.000Z', 16: 300 }),
    cell('inv-2', 'INV', 6, { 2: 'KBA/INV/Y-2', 3: '2035-01-10T00:00:00.000Z', 5: 'Pelanggan Y', 24: 'Site Y', 12: 200.1 }),
    cell('inv-3', 'INV', 7, { 2: 'KBA/INV/Z-3', 3: '2035-01-11T00:00:00.000Z', 5: 'Pelanggan Z', 12: 100, 13: '2035-01-12T00:00:00.000Z', 16: 99.95 }),
    cell('inv-later', 'INV', 8, { 2: 'KBA/INV/LATER', 3: '2035-02-02T00:00:00.000Z', 12: 999 }),
    cell('piutang-total', 'OPS_PIUTANG', 15, { 1: 'Jumlah piutang usaha', 6: 200.1 }),
    cell('proj-open', 'PROYEKSI_KAS', 5, { 1: 'Saldo kas awal (saldo buku)', 2: 100, 3: 120, 4: 130, 6: 'NRC' }),
  ] });
  await db.sourceFact.create({ data: { id: 'rab-x', companyId: 'A', kind: 'BUDGET_RAB', batchId: 'batch', sourceKey: 'rab-x', sourceFileId: 'sourceA', sheet: 'RAB', row: 1, data: { site: 'Site X', category: 'CHEMICAL', label: 'Bahan', monthly: '40.00' } } });
  const settings = (await db.company.findUniqueOrThrow({ where: { id: 'A' } })).settings as Record<string, Record<string, unknown>>;
  await db.company.update({ where: { id: 'A' }, data: { settings: { ...settings, accounting: { ...(settings.accounting ?? {}), ratios: { ...((settings.accounting?.ratios as Record<string, unknown>) ?? {}), chemicalExpenseIds: ['cogs'] } } } as never } });
  const r = await serviceReport(finance, 'A', p.id);
  assert.ok(r.workingPaper.available);
  if (!r.workingPaper.available) return;
  const s = r.workingPaper.sites;
  assert.equal(s.difference, '0.00', 'site P&L adds back to the ledger');
  const x = s.rows.find(row => row.site === 'Site X')!;
  assert.deepEqual([x.revenue, x.direct, x.profit], ['300.00', '100.00', '200.00']);
  const office$ = s.rows.find(row => row.site === 'Kantor pusat/umum')!;
  assert.equal(office$.overhead, true); assert.equal(office$.operating, '50.00');
  const ar = r.workingPaper.receivables;
  assert.deepEqual(ar.open.map(i => [i.number, i.outstanding, i.bucket]), [['KBA/INV/Y-2', '200.10', '0_30']], 'only the unpaid invoice is open; later invoices excluded');
  assert.deepEqual(ar.settlementDifferences.map(i => [i.number, i.outstanding]), [['KBA/INV/Z-3', '0.05']], 'small receipt difference listed separately');
  assert.equal(ar.ledger, '200.10'); assert.equal(ar.difference, '0.00'); assert.equal(ar.workingPaperTotal, '200.10');
  const cash = r.workingPaper.cashProjection;
  assert.deepEqual([cash.projectionOpening, cash.ledgerCash, cash.openingDifference], ['100.00', '150.00', '50.00'], 'projection opening is compared to ledger cash');
  const budget = r.workingPaper.budgets.sites.find(b => b.site === 'Site X')!;
  assert.equal(budget.months, 1, 'budget months = months invoiced to the site');
  assert.deepEqual(budget.rows.map(x => [x.key, x.budget, x.actual, x.variance]), [['MATERIAL', '40.00', '100.00', '-60.00']], 'budget versus mapped actual for the same site');
});
