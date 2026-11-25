/**
 * Analyses taken from the accountant's working paper (KBA "Kertas Kerja Akuntansi") that is
 * already posted to the ledger. Nothing here is estimated by the ERP:
 * - site profitability uses the site the accountant put on every JURNAL row (column 13), only
 *   for rows that were posted, and is reconciled to the ledger profit and loss;
 * - receivable ageing uses the invoice register (sheet INV): net receivable, receipt date and
 *   amount; age counts from the invoice date because contract due dates are not in the source;
 * - payables, the cash projection and the payroll test are the accountant's own schedules
 *   (OPS_UTANG, PROYEKSI_KAS, UJI_PAYROLL), shown with sheet and row so they can be checked.
 * Every list keeps the sheet/row of its source, and totals are compared to the ledger.
 */
import { Prisma } from "@prisma/client";
import { amount, signedCents } from "./money";
import { groupOf } from "./management-report";
import { safeEvidenceUrl } from "./financial-trace";

type Tx = Prisma.TransactionClient;
type Row = { id: string; code: string; name: string; category: string; net: string };
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cellsOf = (d: unknown) => obj(obj(d).cells);
/** Workbook numbers arrive as JS numbers or numeric strings; empty and non-numeric stay null. */
export function sourceCents(v: unknown): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  const text = String(v).trim();
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/^-/, "").replaceAll(",", "").split(".");
  return (text.startsWith("-") ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0")) + (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n));
}
const isoDay = (v: unknown) => {
  const s = String(v ?? "");
  const day = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(s) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : null;
};
export function ageSinceInvoice(invoiceDate: string, asOf: string) {
  if (!isoDay(invoiceDate) || !isoDay(asOf) || invoiceDate > asOf) return { days: null, bucket: "UNKNOWN" };
  const days = Math.floor((Date.parse(asOf) - Date.parse(invoiceDate)) / 86400000);
  return { days, bucket: days <= 30 ? "0_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "OVER_90" };
}
const pct = (part: bigint, whole: bigint) => (whole === 0n ? null : Number((part * 10000n) / whole) / 100);

export async function workingPaperAnalysis(tx: Tx, companyId: string, period: { id: string; startDate: Date; endDate: Date }, rows: Row[], groups: Map<string, string>, ledgerCash: string | null = null, mapping: { chemical: string[]; labor: string[]; reviewed?: boolean; receivable?: string; payable?: string } = { chemical: [], labor: [] }) {
  const asOf = period.endDate.toISOString().slice(0, 10);
  const facts = await tx.$queryRaw<{ site: string | null; code: string; debit: string | null; credit: string | null; sourceFileId: string }[]>(Prisma.sql`
    SELECT f.data->>'13' AS site, f.data->>'accountCode' AS code, f.debit::text AS debit, f.credit::text AS credit, f."sourceFileId"
    FROM source_facts f JOIN journal_entries e ON e.id = f.data->'ledger'->>'journalId'
    WHERE f."companyId"=${companyId} AND f.kind='FINANCIAL_JOURNAL' AND e.company_id=${companyId} AND e.fiscal_period_id=${period.id}
      AND e.status='POSTED' AND e.type<>'CLOSING'`);
  if (!facts.length) return { available: false as const, asOf, note: "Periode ini tidak dibukukan dari kertas kerja." };
  const category = new Map(rows.map((r) => [r.code, r.category]));

  // Site profit and loss (debit-positive for costs, income-positive for revenue and other income).
  type Site = { revenue: bigint; direct: bigint; operating: bigint; other: bigint; tax: bigint; lines: number };
  const sites = new Map<string, Site>();
  for (const f of facts) {
    const cat = category.get(f.code);
    if (cat !== "PENDAPATAN" && cat !== "BEBAN") continue;
    const g = groupOf(f.code, cat, groups);
    const delta = signedCents(f.debit ?? "0") - signedCents(f.credit ?? "0");
    const key = f.site?.trim() || "Tanpa site di kertas kerja";
    const s = sites.get(key) ?? { revenue: 0n, direct: 0n, operating: 0n, other: 0n, tax: 0n, lines: 0 };
    if (g === "PENDAPATAN") s.revenue -= delta;
    else if (g === "HPP") s.direct += delta;
    else if (g === "BEBAN") s.operating += delta;
    else if (g === "LAIN") s.other -= delta;
    else s.tax += delta;
    s.lines++;
    sites.set(key, s);
  }
  const siteRows = [...sites]
    .map(([site, s]) => {
      const gross = s.revenue - s.direct, profit = gross - s.operating + s.other - s.tax;
      return { site, revenue: amount(s.revenue), direct: amount(s.direct), grossProfit: amount(gross), grossMargin: pct(gross, s.revenue), operating: amount(s.operating), other: amount(s.other), tax: amount(s.tax), profit: amount(profit), lines: s.lines, overhead: /kantor pusat|umum/i.test(site) };
    })
    .sort((a, b) => Number(signedCents(b.revenue) - signedCents(a.revenue)));
  const total = (k: keyof Site) => [...sites.values()].reduce((s, x) => s + (x[k] as bigint), 0n);
  const ledgerPl = rows.reduce(
    (acc, r) => {
      if (r.category !== "PENDAPATAN" && r.category !== "BEBAN") return acc;
      const g = groupOf(r.code, r.category, groups), n = signedCents(r.net);
      if (g === "PENDAPATAN") acc.revenue -= n;
      else if (g === "HPP") acc.direct += n;
      else if (g === "BEBAN") acc.operating += n;
      else if (g === "LAIN") acc.other -= n;
      else acc.tax += n;
      return acc;
    },
    { revenue: 0n, direct: 0n, operating: 0n, other: 0n, tax: 0n },
  );
  const siteProfit = total("revenue") - total("direct") - total("operating") + total("other") - total("tax");
  const ledgerProfit = ledgerPl.revenue - ledgerPl.direct - ledgerPl.operating + ledgerPl.other - ledgerPl.tax;

  // Receivable ageing from the invoice register.
  const sourceIds = [...new Set(facts.map(f => f.sourceFileId))];
  const sources = (await tx.sourceFile.findMany({ where: { id: { in: sourceIds }, companyId }, select: { id: true, name: true, url: true } })).map(s => ({ ...s, url: safeEvidenceUrl(s.url) }));
  const sheet = (name: string) => tx.sourceFact.findMany({ where: { companyId, sourceFileId: { in: sourceIds }, sheet: name }, orderBy: { row: "asc" }, select: { id: true, row: true, data: true, sourceFileId: true } });
  const [inv, utang, proyeksi, payroll, piutang] = await Promise.all([sheet("INV"), sheet("OPS_UTANG"), sheet("PROYEKSI_KAS"), sheet("UJI_PAYROLL"), sheet("OPS_PIUTANG")]);
  const invoices = inv
    .map((f) => ({ f, c: cellsOf(f.data) }))
    .filter(({ c }) => /INV/i.test(String(c["2"] ?? "")) && isoDay(c["3"]) && isoDay(c["3"])! <= asOf)
    .map(({ f, c }) => {
      const net = sourceCents(c["12"]), receivedOn = isoDay(c["13"]), receivedAmount = sourceCents(c["16"]) ?? sourceCents(c["15"]);
      const received = receivedOn && receivedOn <= asOf ? receivedAmount : !receivedOn && receivedAmount !== null && receivedAmount !== 0n ? null : 0n;
      const outstanding = net === null || received === null ? null : net - received;
      const age = ageSinceInvoice(isoDay(c["3"])!, asOf);
      return {
        row: f.row, number: String(c["2"]).trim(), date: isoDay(c["3"])!, customer: String(c["5"] ?? ""), site: String(c["24"] ?? c["6"] ?? ""),
        net: net === null ? null : amount(net), receivedOn: receivedOn && receivedOn <= asOf ? receivedOn : null, received: received === null ? null : amount(received),
        outstanding: outstanding === null ? null : amount(outstanding), days: age.days, bucket: age.bucket, withholding: String(c["11"] ?? ""),
      };
    });
  // Small differences are highlighted but remain open until an authorized, evidenced settlement.
  const residual = (i: (typeof invoices)[number]) => {
    const o = signedCents(i.outstanding ?? "0"), n = signedCents(i.net ?? "0"), abs = o < 0n ? -o : o;
    return Boolean(i.receivedOn) && (abs < 100000n || abs * 100n < n);
  };
  const withBalance = invoices.filter((i) => i.outstanding !== null && signedCents(i.outstanding) !== 0n);
  const open = withBalance, differences = withBalance.filter(residual);
  const sumOf = (xs: { outstanding: string | null }[]) => xs.reduce((s, x) => s + signedCents(x.outstanding ?? "0"), 0n);
  const receivableAccounts = rows.filter((r) => r.category === "ASET" && r.id === mapping.receivable);
  const ledgerAr = receivableAccounts.reduce((s, r) => s + signedCents(r.net), 0n);
  const piutangTotal = piutang.map((p) => cellsOf(p.data)).find((c) => /jumlah piutang usaha/i.test(String(c["1"] ?? "")));
  const collected = invoices.filter((i) => i.receivedOn);
  const avgDays = collected.length ? collected.reduce((s, i) => s + Math.floor((Date.parse(i.receivedOn!) - Date.parse(i.date)) / 86400000), 0) / collected.length : null;

  // Payables outstanding schedule (detail rows have a vendor and a TRS row reference).
  const payables = utang
    .map((f) => ({ f, c: cellsOf(f.data) }))
    .filter(({ c }) => isoDay(c["3"]) && isoDay(c["3"])! <= asOf && sourceCents(c["4"]) !== null)
    .map(({ f, c }) => ({ row: f.row, description: String(c["1"] ?? ""), vendor: String(c["2"] ?? ""), date: isoDay(c["3"])!, balance: amount(sourceCents(c["4"])!), account: String(c["5"] ?? ""), site: String(c["6"] ?? ""), treasuryRow: String(c["7"] ?? "") }));
  const nullableMoney = (value: unknown) => { const n = sourceCents(value); return n === null ? null : amount(n); };
  const payableSummary = utang.map((f) => ({ row: f.row, c: cellsOf(f.data) })).filter(({ c, row }) => row < 14 && c["1"] && !isoDay(c["3"])).map(({ row, c }) => ({ row, group: String(c["1"]), count: c["2"] === null || c["2"] === undefined || c["2"] === "" || !/^\d+$/.test(String(c["2"])) ? null : Number(c["2"]), total: nullableMoney(c["3"]), buckets: [c["4"], c["5"], c["6"], c["7"]].map(nullableMoney) }));
  const payableAccount = rows.find(r => r.category === "KEWAJIBAN" && r.id === mapping.payable);
  const ledgerAp = payableAccount ? -signedCents(payableAccount.net) : null;

  // Cash projection: columns 2–4 are the three months after the ledger date, 5 the total.
  const months = [1, 2, 3].map((i) => {
    const d = new Date(Date.UTC(period.endDate.getUTCFullYear(), period.endDate.getUTCMonth() + i, 1));
    return d.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  });
  const projection = proyeksi
    .map((f) => ({ row: f.row, c: cellsOf(f.data) }))
    .filter(({ c }) => String(c["1"] ?? "").trim())
    .map(({ row, c }) => ({ row, label: String(c["1"]).trim(), values: ["2", "3", "4"].map((k) => (sourceCents(c[k]) === null ? null : amount(sourceCents(c[k])!))), total: sourceCents(c["5"]) === null ? null : amount(sourceCents(c["5"])!), basis: String(c["6"] ?? "") }));

  // Payroll reasonableness test (summary lines are self-describing: label, amount, basis).
  const laborTest = payroll
    .map((f) => ({ row: f.row, c: cellsOf(f.data) }))
    .filter(({ c }) => String(c["1"] ?? "").trim() && sourceCents(c["11"]) !== null)
    .map(({ row, c }) => ({ row, label: String(c["1"]).trim(), value: amount(sourceCents(c["11"])!), basis: String(c["12"] ?? ""), ratio: /rasio|ratio|persen|%|tarif/i.test(String(c["1"])), ratioValue: Number(c["11"]) }));

  // Tender budget (RAB) per site versus actual costs booked to that site. Budget months = months invoiced to the
  // site up to the report date (from the invoice register); actual accounts come from the reviewed/proposed mapping.
  const rab = await tx.sourceFact.findMany({ where: { companyId, kind: "BUDGET_RAB" }, orderBy: [{ sourceFileId: "asc" }, { row: "asc" }], select: { row: true, data: true, sourceFileId: true } });
  const codeOf = new Map(rows.map((r) => [r.id, r.code]));
  const accountCodes = (ids: string[]) => ids.map((id) => codeOf.get(id)).filter((c): c is string => Boolean(c));
  const actualFor = (site: string, codes: string[]) => { const matches = facts.filter(f => (f.site?.trim() ?? "") === site && codes.includes(f.code)); return matches.length ? matches.reduce((s, f) => s + signedCents(f.debit ?? "0") - signedCents(f.credit ?? "0"), 0n) : null; };
  const budgetSites = [...new Set(rab.map((r) => String(obj(r.data).site)))];
  const groupsDef = [
    { key: "MATERIAL", label: "Bahan, chemical & perlengkapan habis pakai", categories: ["CHEMICAL", "CONSUMABLE"], codes: accountCodes(mapping.chemical) },
    { key: "LABOR", label: "Tenaga kerja", categories: ["LABOR"], codes: accountCodes(mapping.labor) },
    { key: "EQUIPMENT", label: "Sewa/mesin peralatan", categories: ["EQUIPMENT"], codes: [] as string[] },
  ];
  const budgets = budgetSites.map((site) => {
    const lines = rab.filter((r) => obj(r.data).site === site);
    const months = new Set(invoices.filter((i) => i.site.trim() === site).map((i) => i.date.slice(0, 7))).size;
    return {
      site, months, source: lines[0]?.sourceFileId ?? "",
      rows: groupsDef
        .map((g) => {
          const items = lines.filter((l) => g.categories.includes(String(obj(l.data).category)));
          if (!items.length) return null;
          const monthlyValues = items.map(l => sourceCents(obj(l.data).monthly));
          const monthly = monthlyValues.some(v => v === null) ? null : monthlyValues.reduce<bigint>((s, v) => s + v!, 0n), budget = monthly !== null && months > 0 ? monthly * BigInt(months) : null;
          const actual = actualFor(site, g.codes);
          return {
            key: g.key, label: g.label, items: items.map((l) => String(obj(l.data).label)), monthly: monthly === null ? null : amount(monthly), budget: budget === null ? null : amount(budget),
            actual: actual === null ? null : amount(actual), variance: actual === null || budget === null ? null : amount(budget - actual), usage: actual === null || budget === null ? null : pct(actual, budget),
            accounts: g.codes, note: actual === null ? (g.key === "EQUIPMENT" ? "Biaya sewa/mesin per site tidak dipisahkan pada akun kertas kerja." : "Akun realisasi belum dipetakan.") : mapping.reviewed ? "Klasifikasi realisasi ditinjau; cakupan anggaran masih indikatif." : "SEMENTARA: klasifikasi realisasi belum ditinjau Finance; cakupan anggaran masih indikatif.",
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    };
  });

  return {
    available: true as const,
    sources,
    budgets: { sites: budgets, note: "Perbandingan INDIKATIF: RAB tender per bulan × jumlah bulan tanggal invoice yang teramati. Tanggal invoice belum membuktikan masa layanan atau persetujuan anggaran; kontrak dan periode harus ditinjau. Realisasi mengikuti klasifikasi dan site sumber; biaya kantor pusat belum dialokasikan. Gunakan rencana berbukti untuk anggaran yang disetujui." },
    asOf,
    sites: {
      rows: siteRows,
      totals: { revenue: amount(total("revenue")), direct: amount(total("direct")), operating: amount(total("operating")), profit: amount(siteProfit) },
      ledger: { revenue: amount(ledgerPl.revenue), direct: amount(ledgerPl.direct), operating: amount(ledgerPl.operating), profit: amount(ledgerProfit) },
      difference: amount(ledgerProfit - siteProfit),
      note: "Site menurut kolom site setiap baris jurnal kertas kerja yang diposting. \"Kantor pusat/umum\" adalah biaya bersama yang tidak dibagikan ke site; tidak ada alokasi tebakan.",
    },
    receivables: {
      invoices: invoices.length,
      open,
      total: amount(sumOf(open)),
      buckets: ["0_30", "31_60", "61_90", "OVER_90"].map((b) => ({ bucket: b, count: open.filter((i) => i.bucket === b).length, amount: amount(sumOf(open.filter((i) => i.bucket === b))) })),
      ledger: receivableAccounts.length ? amount(ledgerAr) : null,
      ledgerAccounts: receivableAccounts.map((r) => `${r.code} ${r.name}`),
      settlementDifferences: differences,
      settlementDifferenceTotal: amount(sumOf(differences)),
      difference: receivableAccounts.length ? amount(ledgerAr - sumOf(open)) : null,
      incomplete: invoices.filter(i => i.outstanding === null).length,
      workingPaperTotal: piutangTotal ? nullableMoney(piutangTotal["6"]) : null,
      averageCollectionDays: avgDays === null ? null : Math.round(avgDays * 10) / 10,
      note: "Umur sejak tanggal invoice merupakan analisis sumber, bukan aging jatuh tempo kontrak. Penerimaan memakai tanggal/jumlah yang terbukti s.d. laporan. Seluruh sisa nonnol, termasuk selisih kecil, tetap masuk saldo terbuka sampai diselesaikan dengan bukti. Baris dengan jumlah/tanggal penerimaan ambigu tidak dianggap nol dan ditandai belum lengkap.",
    },
    payables: { rows: payables, detailNote: `${payables.length} rincian terbesar dari ${payableSummary.find((x) => /jumlah/i.test(x.group))?.count ?? "jumlah belum diketahui"} pos; kelompok umur mengikuti kertas kerja. Rincian ini bukan daftar seluruh pos.`, total: amount(payables.reduce((s, p) => s + signedCents(p.balance), 0n)), summary: payableSummary, ledger: ledgerAp === null ? null : amount(ledgerAp), note: "Utang menurut OPS_UTANG, rujukan treasury dan akun kontrol eksplisit. Cakupan akun lain tetap memerlukan rekonsiliasi tersendiri." },
    cashProjection: {
      months, rows: projection,
      ledgerCash,
      projectionOpening: projection.find((x) => /saldo kas awal/i.test(x.label))?.values[0] ?? null,
      openingDifference: (() => { const o = projection.find((x) => /saldo kas awal/i.test(x.label))?.values[0]; return o && ledgerCash ? amount(signedCents(ledgerCash) - signedCents(o)) : null; })(),
      note: "Proyeksi akuntan (sheet PROYEKSI_KAS). Baris beban tenaga kerja memakai parameter estimasi kertas kerja sampai payroll aktual tersedia; proyeksi bukan transaksi." },
    laborTest: { rows: laborTest, note: "Uji kewajaran beban tenaga kerja oleh akuntan (sheet UJI_PAYROLL): upah tersirat dari iuran BPJS, cadangan THR/kompensasi dan estimasi AJP-03." },
  };
}
