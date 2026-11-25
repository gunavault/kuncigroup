import { Prisma } from "@prisma/client";
import { db } from "./db";
import { reports } from "./accounting";
import { requireFinancialScope } from "./financial-trace";
import { amount, signedCents } from "./money";
import { object, str } from "./operations/shared";
import { groupOf } from "./management-report";
import { ratioValue } from "./financial-ratios";
import { emptyServicePlan, servicePlanKey } from "./service-plans";
import { authorizeCompany, type Actor } from "./auth";
import { ratioMappingHash } from "./ratio-mapping-review";
import { workingPaperAnalysis } from "./working-paper-analysis";
export function ageBucket(due: string, asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due) return "UNKNOWN";
  const days = Math.floor((Date.parse(asOf) - Date.parse(due)) / 86400000);
  return days <= 0 ? "CURRENT" : days <= 30 ? "1_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "OVER_90";
}
export async function serviceReport(actor: Actor, companyId: string, periodId: string, stockPage = 0) {
  requireFinancialScope(actor, companyId);
  return db.$transaction(async tx => {
    const period = await tx.fiscalPeriod.findFirstOrThrow({ where: { id: periodId, companyId } }), company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const r = await reports(tx, period.id), config = object(object(company.settings).accounting), asOf = period.endDate.toISOString().slice(0, 10);
    const ratioConfig = object(config.ratios), review = object(config.ratioMappingReview), mappingReviewed = review.status === "VERIFIED" && review.hash === ratioMappingHash(ratioConfig);
    const planRow = await tx.moduleSetting.findUnique({ where: { companyId_key: { companyId, key: servicePlanKey(period.id) } } });
    const plan = { ...emptyServicePlan(), ...object(planRow?.settings) } as ReturnType<typeof emptyServicePlan>;
    const projects = await tx.masterRecord.findMany({ where: { companyId, kind: "PROJECT" }, select: { id: true, code: true, name: true } });
    const records = await tx.businessRecord.findMany({ where: { companyId, status: "POSTED", journalId: { not: null }, date: { lte: period.endDate } }, select: { id: true, number: true, module: true, date: true, journalId: true, data: true } });
    const linked = await tx.journalLine.findMany({ where: { entry: { companyId, status: "POSTED", transactionDate: { lte: period.endDate }, id: { in: records.map(d => d.journalId!) }, type: { not: "CLOSING" } } }, select: { journalEntryId: true, accountId: true, debit: true, credit: true, entry: { select: { fiscalPeriodId: true } } } });
    const masters = await tx.masterRecord.findMany({ where: { companyId, kind: { in: ["PARTNER", "EMPLOYEE"] } }, select: { id: true, code: true, name: true } });
    const net = (journalId: string, accountId: string, credit = false) => linked.filter(l => l.journalEntryId === journalId && l.accountId === accountId).reduce((s, l) => s + (signedCents(l.debit) - signedCents(l.credit)) * (credit ? -1n : 1n), 0n);
    const aging = (side: "AR" | "AP", accountId: string) => {
      const account = r.rows.find(a => a.id === accountId && a.category === (side === "AR" ? "ASET" : "KEWAJIBAN"));
      const docs = records.filter(d => side === "AR" ? d.module === "sales" && ["", "INVOICE"].includes(str(object(d.data).documentType)) : ["purchase", "expenses", "maintenance"].includes(d.module) && ["", "BILL"].includes(str(object(d.data).documentType)));
      const rows = docs.map(d => {
        const initial = account ? net(d.journalId!, account.id, side === "AP") : 0n;
        const payments = records.filter(p => p.module === "payments" && str(object(p.data).direction) === (side === "AR" ? "RECEIVE" : "PAY") && (object(p.data).referenceId === d.id || object(p.data).referenceId === d.number && docs.filter(other => other.number === d.number).length === 1));
        const paid = account ? payments.reduce((s, p) => s - net(p.journalId!, account.id, side === "AP"), 0n) : 0n;
        const balance = initial - paid, data = object(d.data), party = masters.find(m => m.id === data.partnerId || m.id === data.employeeId);
        return { id: d.id, number: d.number, journalId: d.journalId!, periodId: linked.find(l => l.journalEntryId === d.journalId)?.entry.fiscalPeriodId ?? period.id, date: d.date.toISOString().slice(0, 10), due: str(data.dueDate), party: party ? `${party.code} ${party.name}` : "Belum dipadankan", projectId: str(data.projectId), initial: amount(initial), paid: amount(paid), balance: amount(balance), bucket: ageBucket(str(data.dueDate), asOf) };
      }).filter(d => signedCents(d.balance) !== 0n);
      const balance = rows.reduce((s, d) => s + signedCents(d.balance), 0n), ledger = account && r.entries.length ? signedCents(account.net) * (side === "AP" ? -1n : 1n) : null;
      const buckets = ["CURRENT", "1_30", "31_60", "61_90", "OVER_90", "UNKNOWN"].map(bucket => ({ bucket, count: rows.filter(d => d.bucket === bucket).length, amount: amount(rows.filter(d => d.bucket === bucket).reduce((s, d) => s + signedCents(d.balance), 0n)) }));
      return { account: account ? `${account.code} ${account.name}` : "Akun kontrol belum dipetakan", ledger: ledger === null ? null : amount(ledger), detailTotal: amount(balance), unallocated: ledger === null ? null : amount(ledger - balance), buckets, rows,
        note: "Rincian memakai jurnal dokumen dan pembayaran yang diposting s.d. tanggal laporan, bukan saldo settlement terkini. Saldo akun kontrol yang belum memiliki rincian ditampilkan sebagai belum dipadankan, tanpa umur rekaan." };
    };
    const mapRows = await tx.$queryRaw<{ code: string; g: string | null }[]>(Prisma.sql`SELECT DISTINCT data->>'accountCode' AS code, data->>'16' AS g FROM source_facts WHERE "companyId"=${companyId} AND kind='FINANCIAL_JOURNAL'`);
    const groups = new Map(mapRows.filter(x => x.code && x.g).map(x => [x.code, String(x.g)]));
    const workingPaper = await workingPaperAnalysis(tx, companyId, period, r.rows, groups, r.entries.length ? r.cash.ending : null, {
      chemical: Array.isArray(object(object(config).ratios).chemicalExpenseIds) ? (object(object(config).ratios).chemicalExpenseIds as string[]) : [],
      labor: Array.isArray(object(object(config).ratios).laborExpenseIds) ? (object(object(config).ratios).laborExpenseIds as string[]) : [],
      reviewed: mappingReviewed, receivable: str(config.receivable), payable: str(config.payable),
    });
    const sites = new Map<string, { revenue: bigint; direct: bigint; operating: bigint; profit: bigint }>();
    const allocatedCosts: { projectId: string; accountId: string; value: bigint }[] = [];
    const allocatableLines: { id: string; journalId: string; journal: string; account: string; value: string; date: string; description: string }[] = [];
    for (const entry of r.entries) {
      const source = records.find(d => d.journalId === entry.id), projectId = str(object(source?.data).projectId), defaultKey = projects.some(p => p.id === projectId) ? projectId : "UNALLOCATED";
      for (const line of entry.lines.filter(l => ["PENDAPATAN", "BEBAN"].includes(l.account.category))) {
        const delta = signedCents(line.debit) - signedCents(line.credit), absolute = delta < 0n ? -delta : delta, group = groupOf(line.account.code, line.account.category, groups);
        allocatableLines.push({ id: line.id, journalId: entry.id, journal: entry.journalNumber, account: `${line.account.code} ${line.account.name}`, value: amount(absolute), date: entry.transactionDate.toISOString().slice(0, 10), description: line.description || entry.description });
        const explicit = plan.allocations.filter(a => a.lineId === line.id), allocated = explicit.reduce((s, a) => s + signedCents(a.amount), 0n);
        if (allocated > absolute) throw Error("Alokasi analitis melebihi nilai baris; Finance perlu meninjau rencana.");
        const pieces = [...explicit.map(a => ({ projectId: a.projectId, amount: signedCents(a.amount) })), { projectId: defaultKey, amount: absolute - allocated }];
        for (const piece of pieces) {
          if (!piece.amount) continue;
          const key = piece.projectId, value = piece.amount * (delta < 0n ? -1n : 1n), site = sites.get(key) ?? { revenue: 0n, direct: 0n, operating: 0n, profit: 0n };
          if (line.account.category === "PENDAPATAN") site.revenue -= value;
          else { if (group === "HPP") site.direct += value; else site.operating += value; allocatedCosts.push({ projectId: key, accountId: line.accountId, value }); }
          site.profit -= value; sites.set(key, site);
        }
      }
    }
    const siteRows = [...sites].filter(([, s]) => s.revenue || s.direct || s.operating).map(([id, s]) => ({ id, name: id === "UNALLOCATED" ? "Belum dialokasikan ke site (termasuk saldo awal)" : projects.find(p => p.id === id)!.name, revenue: amount(s.revenue), direct: amount(s.direct), operating: amount(s.operating), profit: amount(s.profit), margin: ratioValue(s.profit, s.revenue, true) }));
    const categoryValue = (key: string, entries = r.entries) => {
      const ids = ratioConfig[key]; if (!Array.isArray(ids) || !ids.length || ids.some(id => !r.rows.some(a => a.id === id && a.category === "BEBAN"))) return null;
      return entries.reduce((s, e) => s + e.lines.filter(l => ids.includes(l.accountId)).reduce((t, l) => t + signedCents(l.debit) - signedCents(l.credit), 0n), 0n);
    };
    const labor = categoryValue("laborExpenseIds"), laborRatio = labor === null ? null : ratioValue(labor, signedCents(r.revenue), true);
    const budgets = plan.budgets.map(b => {
      const key = b.category === "LABOR" ? "laborExpenseIds" : "chemicalExpenseIds", total = categoryValue(key), ids = Array.isArray(ratioConfig[key]) ? ratioConfig[key] as string[] : [];
      const actual = total === null || !sites.has(b.projectId) ? null : allocatedCosts.filter(c => c.projectId === b.projectId && ids.includes(c.accountId)).reduce((s, c) => s + c.value, 0n);
      const unallocated = total === null ? null : allocatedCosts.filter(c => c.projectId === "UNALLOCATED" && ids.includes(c.accountId)).reduce((s, c) => s + c.value, 0n);
      return { ...b, projectName: projects.find(p => p.id === b.projectId)?.name ?? "Proyek perlu dipadankan", actual: actual === null ? null : amount(actual), variance: actual === null || unallocated !== 0n ? null : amount(signedCents(b.amount) - actual), note: (actual !== null && !mappingReviewed ? "SEMENTARA: klasifikasi biaya belum ditinjau Finance. " : "") + (actual === null ? "Alokasi proyek atau pemetaan akun biaya belum lengkap." : unallocated !== 0n ? "Aktual hanya bagian teralokasi; masih ada biaya perusahaan yang belum dialokasikan. Sisa anggaran belum dapat dipastikan." : "Aktual mengikuti akun terpilih dan alokasi proyek berbukti.") };
    });
    let cash: bigint | null = r.entries.length ? signedCents(r.cash.ending) : null;
    const cashPlans = [...plan.cashPlans].sort((a, b) => a.date.localeCompare(b.date)).map(p => { if (cash !== null) cash += signedCents(p.amount) * (p.direction === "IN" ? 1n : -1n); return { ...p, balance: cash === null ? null : amount(cash), shortfall: cash === null ? null : cash < 0n ? amount(-cash) : "0.00" }; });
    const sources = await tx.businessRecord.groupBy({ by: ["module"], where: { companyId, status: "IMPORTED" }, _count: true });
    const stockWhere = { companyId, effectiveDate: { gte: period.startDate, lte: period.endDate } };
    const stockTotal = await tx.stockMovement.count({ where: stockWhere });
    const stock = await tx.stockMovement.findMany({ where: stockWhere, orderBy: [{ effectiveDate: "desc" }, { id: "asc" }], take: 100, skip: Math.max(0, Math.floor(stockPage)) * 100, select: { id: true, effectiveDate: true, recordId: true, productId: true, quantity: true, value: true } });
    const products = await tx.masterRecord.findMany({ where: { companyId, kind: "PRODUCT", id: { in: stock.map(s => s.productId) } }, select: { id: true, code: true, name: true } });
    return { company: { id: company.id, name: company.name }, period: { id: period.id, name: period.name, status: period.status, asOf }, canEdit: ["ADMIN", "FINANCE"].includes(authorizeCompany(actor, companyId)), plan, projects,
      aging: { ar: aging("AR", str(config.receivable)), ap: aging("AP", str(config.payable)) }, workingPaper, sites: siteRows, labor: { cost: labor === null ? null : amount(labor), revenue: r.revenue, ratio: laborRatio, provisional: labor !== null && !mappingReviewed, note: labor === null ? "Finance perlu memetakan akun biaya tenaga kerja; angka tidak ditaksir dari payroll neto." : mappingReviewed ? "Biaya tenaga kerja berdasarkan akun yang ditinjau Finance terhadap pendapatan buku besar pada periode yang sama." : "SEMENTARA: akun tenaga kerja dari usulan pemetaan otomatis yang belum ditinjau Finance. Termasuk estimasi AJP-03 sampai payroll aktual dibukukan." },
      budgets, cash: { opening: r.entries.length ? r.cash.ending : null, plans: cashPlans, complete: cashPlans.length > 0 && r.entries.length > 0, note: "Skenario berbukti dari kas akhir periode. Rencana penerimaan/pengeluaran bukan transaksi dan tidak membentuk jurnal. Rencana kosong belum merupakan proyeksi kas lengkap." },
      allocatableLines, stockTotal, stockPage, stockPageSize: 100, stockMovements: stock.map(s => ({ ...s, productName: products.find(p => p.id === s.productId)?.name ?? "Produk belum dipadankan", effectiveDate: s.effectiveDate.toISOString().slice(0, 10), quantity: s.quantity.toString(), value: s.value.toString() })), sourceImports: sources.map(s => ({ module: s.module, count: s._count })),
      caveats: ["Pendapatan, beban dan saldo kontrol mengikuti jurnal POSTED sebelum penutupan. Dokumen IMPORTED tetap berada pada register sumber.", "Jurnal tanpa proyek ditempatkan pada Belum dialokasikan. Tidak ada pembagian biaya berdasarkan tebakan nama/omzet.", "Tanggal jatuh tempo yang belum terbukti masuk kelompok Belum diketahui. CaLK dan rencana tersimpan sebagai draft sampai proses tinjauan dan finalisasi bisnis selesai."] };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
