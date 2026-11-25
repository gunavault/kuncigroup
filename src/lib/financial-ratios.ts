import { Prisma } from "@prisma/client";
import { db } from "./db";
import { reports } from "./accounting";
import { amount, signedCents } from "./money";
import { object } from "./operations/shared";
import { groupOf } from "./management-report";
import { requireFinancialScope } from "./financial-trace";
import type { Actor } from "./auth";
import { ratioMappingHash } from "./ratio-mapping-review";

type Trace = { statement: string; metric: string; account?: string; entryType?: string };
export type Ratio = {
  key: string; label: string; group: "Keuangan" | "Operasional"; unit: "%" | "kali" | "hari";
  value: string | null; formula: string; numerator: string; denominator: string;
  basis: string; reason: string | null; trace?: Trace;
  traces?: (Trace & { label: string })[];
};
/** Round to two decimal places using integers, including negative numerators. */
export function ratioValue(n: bigint, d: bigint, percent = false): string | null {
  if (d <= 0n) return null;
  const scaled = (n < 0n ? -n : n) * (percent ? 10000n : 100n);
  return amount((n < 0n ? -1n : 1n) * ((scaled + d / 2n) / d));
}
export async function financialRatios(actor: Actor, companyId: string, periodId: string) {
  requireFinancialScope(actor, companyId);
  return db.$transaction(async tx => {
    const period = await tx.fiscalPeriod.findFirstOrThrow({ where: { id: periodId, companyId } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const r = await reports(tx, period.id), config = object(object(company.settings).accounting), mapping = object(config.ratios);
    const automatic = await tx.auditEvent.findFirst({ where: { companyId, action: "RATIO_MAPPING_AUTO" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    const review = object(config.ratioMappingReview), verified = review.status === "VERIFIED" && review.hash === ratioMappingHash(mapping);
    const mappingPending = !verified && (Boolean(automatic) || review.status === "PENDING" || review.status === "VERIFIED");
    const maps = await tx.$queryRaw<{ code: string; g: string | null }[]>(Prisma.sql`SELECT DISTINCT data->>'accountCode' AS code, data->>'16' AS g FROM source_facts WHERE "companyId"=${companyId} AND kind='FINANCIAL_JOURNAL'`);
    const groups = new Map(maps.filter(x => x.code && x.g).map(x => [x.code, String(x.g)]));
    const net = (ids: Set<string>, opening = false) => r.entries.filter(e => !opening || e.type === "OPENING").reduce((sum, e) => sum + e.lines.filter(l => ids.has(l.accountId)).reduce((s, l) => s + signedCents(l.debit) - signedCents(l.credit), 0n), 0n);
    const mapped = (key: string, category: string, credit = false, opening = false): bigint | null => {
      const ids = mapping[key];
      if (mappingPending) return null;
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !r.rows.some(a => a.id === id && a.category === category))) return null;
      return net(new Set(ids.map(String)), opening) * (credit ? -1n : 1n);
    };
    const revenue = r.rows.filter(a => groupOf(a.code, a.category, groups) === "PENDAPATAN").reduce((s, a) => s - signedCents(a.net), 0n);
    const cogs = r.rows.filter(a => groupOf(a.code, a.category, groups) === "HPP").reduce((s, a) => s + signedCents(a.net), 0n);
    const opex = r.rows.filter(a => groupOf(a.code, a.category, groups) === "BEBAN").reduce((s, a) => s + signedCents(a.net), 0n);
    const hasCogs = [...groups.values()].includes("HPP"), profit = signedCents(r.profit), assets = signedCents(r.assets), equity = signedCents(r.equity), liabilities = signedCents(r.liabilities);
    const operating = signedCents(r.cash.operating), cash = signedCents(r.cash.ending);
    const posted = r.entries.length > 0, openingKnown = r.entries.some(e => e.type === "OPENING" && e.transactionDate.getTime() === period.startDate.getTime());
    const openingAssets = net(new Set(r.rows.filter(a => a.category === "ASET").map(a => a.id)), true);
    const openingEquity = -net(new Set(r.rows.filter(a => ["EKUITAS", "PENDAPATAN", "BEBAN"].includes(a.category)).map(a => a.id)), true);
    const days = Math.round((period.endDate.getTime() - period.startDate.getTime()) / 86400000) + 1;
    const basis = `Jurnal POSTED tanpa penutup · ${period.startDate.toISOString().slice(0, 10)} s.d. ${period.endDate.toISOString().slice(0, 10)} (${days} hari). Tidak disetahunkan.`;
    const ratios: Ratio[] = [];
    const add = (key: string, label: string, unit: Ratio["unit"], n: bigint | null, d: bigint | null, formula: string, trace?: Trace, missing?: string, group: Ratio["group"] = "Keuangan", nLabel?: string, dLabel?: string) => {
      const reason = missing ?? (!posted && group === "Keuangan" ? "Belum ada jurnal POSTED pada periode ini." : n === null || d === null ? "Pemetaan atau data dasar belum lengkap." : d <= 0n ? "Penyebut nol atau negatif; rasio tidak dapat diinterpretasikan." : null);
      ratios.push({ key, label, group, unit, value: reason || n === null || d === null ? null : ratioValue(n, d, unit === "%"), formula, numerator: nLabel ?? (n === null ? "Belum tersedia" : amount(n)), denominator: dLabel ?? (d === null ? "Belum tersedia" : amount(d)), basis, reason, ...(trace ? { trace } : {}) });
    };
    const pl = (metric: string): Trace => ({ statement: "PROFIT_LOSS", metric });
    add("grossMargin", "Margin laba kotor", "%", revenue - cogs, revenue, "(Pendapatan usaha − HPP) / pendapatan usaha × 100%", pl("grossProfit"), !hasCogs ? "Kelompok akun HPP belum ditetapkan dari sumber." : undefined);
    add("operatingMargin", "Margin laba usaha", "%", revenue - cogs - opex, revenue, "Laba usaha / pendapatan usaha × 100%", pl("operatingProfit"), !hasCogs ? "Kelompok akun HPP belum ditetapkan dari sumber." : undefined);
    add("netMargin", "Margin laba bersih", "%", profit, revenue, "Laba bersih / pendapatan usaha × 100%", pl("profit"));
    add("expenseRatio", "Beban usaha terhadap pendapatan", "%", opex, revenue, "Beban usaha / pendapatan usaha × 100%", pl("BEBAN"));
    add("liabilitiesAssets", "Liabilitas terhadap aset", "%", liabilities, assets, "Total liabilitas / total aset × 100%", { statement: "BALANCE", metric: "liabilities" });
    add("liabilitiesEquity", "Liabilitas terhadap ekuitas", "kali", liabilities, equity, "Total liabilitas / ekuitas (termasuk kewajiban nonpinjaman)", { statement: "BALANCE", metric: "equity" });
    add("cashAssets", "Porsi kas terhadap aset", "%", cash, assets, "Kas dan setara kas / total aset × 100%", { statement: "CASH_FLOW", metric: "ending" });
    add("operatingCashMargin", "Arus kas operasi terhadap pendapatan", "%", operating, revenue, "Arus kas operasi / pendapatan usaha × 100%", { statement: "CASH_FLOW", metric: "operating" });
    add("cashProfit", "Arus kas operasi terhadap laba", "kali", operating, profit, "Arus kas operasi / laba bersih", { statement: "CASH_FLOW", metric: "operating" });
    const openingTemporary = r.rows.some(a => ["PENDAPATAN", "BEBAN"].includes(a.category) && net(new Set([a.id]), true) !== 0n);
    const averageMissing = !openingKnown ? "Saldo awal pada hari pertama periode belum dibuktikan; rata-rata saldo belum tersedia." : openingTemporary ? "Saldo awal memuat akun pendapatan/beban. Finance perlu memastikan batas periode sebelum memakai rasio rata-rata." : openingAssets < 0n || assets < 0n ? "Saldo aset awal/akhir negatif perlu direkonsiliasi." : undefined;
    add("roa", "ROA periode (rata-rata aset)", "%", profit * 2n, openingAssets + assets, "Laba bersih / ((aset awal + aset akhir) / 2) × 100%", pl("profit"), averageMissing, "Keuangan", `${amount(profit)} × 2`, `${amount(openingAssets)} + ${amount(assets)}`);
    add("roe", "ROE periode (rata-rata ekuitas)", "%", profit * 2n, openingEquity + equity, "Laba bersih / ((ekuitas awal + ekuitas akhir) / 2) × 100%", pl("profit"), averageMissing ?? (openingEquity <= 0n || equity <= 0n ? "Ekuitas awal/akhir nol atau negatif; ROE tidak dapat diinterpretasikan." : undefined), "Keuangan", `${amount(profit)} × 2`, `${amount(openingEquity)} + ${amount(equity)}`);
    add("assetTurnover", "Perputaran aset periode", "kali", revenue * 2n, openingAssets + assets, "Pendapatan usaha / rata-rata total aset", pl("PENDAPATAN"), averageMissing, "Keuangan", `${amount(revenue)} × 2`, `${amount(openingAssets)} + ${amount(assets)}`);
    const currentAssets = mapped("currentAssetIds", "ASET"), currentLiabilities = mapped("currentLiabilityIds", "KEWAJIBAN", true), quickAssets = mapped("quickAssetIds", "ASET"), debt = mapped("interestBearingDebtIds", "KEWAJIBAN", true);
    add("current", "Rasio lancar", "kali", currentAssets, currentLiabilities, "Aset lancar / liabilitas lancar", undefined, currentAssets === null || currentLiabilities === null ? "Klasifikasi akun lancar belum ditetapkan pada pengaturan rasio." : undefined);
    add("quick", "Rasio cepat", "kali", quickAssets, currentLiabilities, "Aset cepat (kas + investasi likuid + piutang) / liabilitas lancar", undefined, quickAssets === null || currentLiabilities === null ? "Pemetaan aset cepat dan liabilitas lancar belum lengkap; persediaan/beban dibayar di muka tidak diasumsikan likuid." : undefined);
    add("cashRatio", "Rasio kas", "kali", cash, currentLiabilities, "Kas dan setara kas / liabilitas lancar");
    add("debtEquity", "Pinjaman berbunga terhadap ekuitas", "kali", debt, equity, "Pinjaman berbunga / ekuitas", undefined, debt === null ? "Pemetaan pinjaman berbunga belum ditetapkan; total utang tidak dianggap seluruhnya pinjaman." : undefined);
    const inventory = mapped("inventoryIds", "ASET"), inventoryStart = mapped("inventoryIds", "ASET", false, true), ar = mapped("receivableIds", "ASET"), arStart = mapped("receivableIds", "ASET", false, true), creditSales = mapped("creditSalesRevenueIds", "PENDAPATAN", true), interest = mapped("interestExpenseIds", "BEBAN");
    const inventorySum = inventory === null || inventoryStart === null ? null : inventory + inventoryStart;
    const inventoryMissing = averageMissing ?? (!hasCogs ? "Kelompok akun HPP belum ditetapkan." : inventorySum === null ? "Pemetaan persediaan belum ditetapkan." : inventory! < 0n || inventoryStart! < 0n ? "Saldo persediaan negatif perlu direkonsiliasi." : undefined);
    add("inventoryTurnover", "Perputaran persediaan periode", "kali", cogs * 2n, inventorySum, "HPP / ((persediaan awal + akhir) / 2)", undefined, inventoryMissing, "Keuangan", `${amount(cogs)} × 2`, inventorySum === null ? undefined : `${amount(inventoryStart!)} + ${amount(inventory!)}`);
    add("dio", "Hari persediaan (DIO)", "hari", inventorySum === null ? null : inventorySum * BigInt(days), cogs * 2n, "Rata-rata persediaan / HPP × hari dalam periode", undefined, inventoryMissing, "Keuangan", inventorySum === null ? undefined : `(${amount(inventoryStart!)} + ${amount(inventory!)}) × ${days}`, `${amount(cogs)} × 2`);
    const arSum = ar === null || arStart === null ? null : ar + arStart;
    add("dso", "Hari penagihan (DSO)", "hari", arSum === null ? null : arSum * BigInt(days), creditSales === null ? null : creditSales * 2n, "Rata-rata piutang usaha / penjualan kredit neto × hari periode", undefined, averageMissing ?? (arSum === null || creditSales === null ? "Pemetaan piutang dan akun khusus penjualan kredit belum lengkap; seluruh omzet tidak diasumsikan penjualan kredit." : ar! < 0n || arStart! < 0n ? "Piutang negatif perlu direkonsiliasi." : undefined), "Keuangan", arSum === null ? undefined : `(${amount(arStart!)} + ${amount(ar!)}) × ${days}`, creditSales === null ? undefined : `${amount(creditSales)} × 2`);
    const tax = r.rows.filter(a => groupOf(a.code, a.category, groups) === "PAJAK").reduce((s, a) => s + signedCents(a.net), 0n);
    add("interestCoverage", "Cakupan beban bunga", "kali", interest === null ? null : profit + tax + interest, interest, "EBIT (laba bersih + pajak penghasilan + bunga) / beban bunga", undefined, interest === null ? "Pemetaan beban bunga belum ditetapkan." : undefined);
    add("dpo", "Hari pembayaran (DPO)", "hari", null, null, "Rata-rata utang usaha / pembelian kredit neto × hari periode", undefined, "Pembelian kredit neto dengan cakupan lengkap belum direkonsiliasi. HPP tidak dipakai sebagai pengganti pembelian.");

    const documents = await tx.businessRecord.findMany({ where: { companyId, date: { gte: period.startDate, lte: period.endDate }, status: { notIn: ["IMPORTED", "CANCELLED", "REJECTED"] } }, select: { module: true, status: true, journalId: true, amount: true, settled: true, data: true } });
    const booked = documents.filter(d => d.status === "POSTED");
    add("workflowCompletion", "Penyelesaian dokumen operasional", "%", BigInt(booked.length), BigInt(documents.length), "Dokumen POSTED / dokumen aktif nonimpor × 100%", undefined, documents.length ? undefined : "Belum ada dokumen operasional nonimpor pada periode ini.", "Operasional", `${booked.length} dokumen`, `${documents.length} dokumen`);
    const advances = booked.filter(d => d.module === "cash-advance" && d.journalId), advanced = advances.reduce((s, d) => s + signedCents(d.amount), 0n), settled = advances.reduce((s, d) => s + signedCents(d.settled), 0n);
    add("advanceSettlement", "Pertanggungjawaban kasbon", "%", settled, advanced, "Kasbon dipertanggungjawabkan/dikembalikan / kasbon POSTED × 100%", undefined, advances.length ? undefined : "Belum ada kasbon dengan jurnal POSTED pada periode ini.", "Operasional");
    const qc = booked.filter(d => d.module === "quality" && ["PASS", "FAIL"].includes(String(object(d.data).result)));
    add("qualityPass", "Kelulusan pemeriksaan mutu", "%", BigInt(qc.filter(d => object(d.data).result === "PASS").length), BigInt(qc.length), "QC POSTED lulus / QC POSTED dengan hasil PASS atau FAIL × 100%", undefined, qc.length ? undefined : "Belum ada pemeriksaan mutu POSTED dengan hasil pada periode ini.", "Operasional", `${qc.filter(d => object(d.data).result === "PASS").length} pemeriksaan lulus`, `${qc.length} pemeriksaan`);
    const imports = await tx.businessRecord.count({ where: { companyId, date: { gte: period.startDate, lte: period.endDate }, status: "IMPORTED" } });
    const trace = (statement: string, metric: string, label: string, entryType?: string) => ({ statement, metric, label, ...(entryType ? { entryType } : {}) });
    const rev = trace("PROFIT_LOSS", "PENDAPATAN", "Pendapatan usaha"), pnl = trace("PROFIT_LOSS", "profit", "Laba bersih"), asset = trace("BALANCE", "assets", "Aset akhir"), eq = trace("BALANCE", "equity", "Ekuitas akhir"), liab = trace("BALANCE", "liabilities", "Liabilitas"), endCash = trace("CASH_FLOW", "ending", "Kas akhir"), opCash = trace("CASH_FLOW", "operating", "Arus kas operasi");
    const mappedTraces = (key: string, label: string) => Array.isArray(mapping[key]) ? (mapping[key] as string[]).filter(id => r.rows.some(a => a.id === id)).map(id => ({ statement: "JOURNAL", metric: "account", account: id, label: `${label}: ${r.rows.find(a => a.id === id)!.code}` })) : [];
    const links: Record<string, (Trace & { label: string })[]> = {
      grossMargin: [trace("PROFIT_LOSS", "grossProfit", "Laba kotor"), rev], operatingMargin: [trace("PROFIT_LOSS", "operatingProfit", "Laba usaha"), rev], netMargin: [pnl, rev], expenseRatio: [trace("PROFIT_LOSS", "BEBAN", "Beban usaha"), rev], liabilitiesAssets: [liab, asset], liabilitiesEquity: [liab, eq], cashAssets: [endCash, asset], operatingCashMargin: [opCash, rev], cashProfit: [opCash, pnl],
      roa: [pnl, trace("BALANCE", "assets", "Aset awal", "OPENING"), asset], roe: [pnl, trace("BALANCE", "equity", "Ekuitas awal", "OPENING"), eq], assetTurnover: [rev, trace("BALANCE", "assets", "Aset awal", "OPENING"), asset],
      current: [...mappedTraces("currentAssetIds", "Aset lancar"), ...mappedTraces("currentLiabilityIds", "Liabilitas lancar")], quick: [...mappedTraces("quickAssetIds", "Aset cepat"), ...mappedTraces("currentLiabilityIds", "Liabilitas lancar")], cashRatio: [endCash, ...mappedTraces("currentLiabilityIds", "Liabilitas lancar")], debtEquity: [...mappedTraces("interestBearingDebtIds", "Pinjaman berbunga"), eq],
      inventoryTurnover: [trace("PROFIT_LOSS", "HPP", "HPP"), ...mappedTraces("inventoryIds", "Persediaan akhir"), ...mappedTraces("inventoryIds", "Persediaan awal").map(t => ({ ...t, entryType: "OPENING" }))],
      dio: [trace("PROFIT_LOSS", "HPP", "HPP"), ...mappedTraces("inventoryIds", "Persediaan akhir"), ...mappedTraces("inventoryIds", "Persediaan awal").map(t => ({ ...t, entryType: "OPENING" }))],
      dso: [...mappedTraces("creditSalesRevenueIds", "Penjualan kredit"), ...mappedTraces("receivableIds", "Piutang akhir"), ...mappedTraces("receivableIds", "Piutang awal").map(t => ({ ...t, entryType: "OPENING" }))],
      interestCoverage: [pnl, trace("PROFIT_LOSS", "PAJAK", "Pajak penghasilan"), ...mappedTraces("interestExpenseIds", "Beban bunga")],
    };
    ratios.forEach(ratio => { ratio.traces = links[ratio.key] ?? []; if (mappingPending && ["current", "quick", "cashRatio", "debtEquity", "inventoryTurnover", "dio", "dso", "interestCoverage"].includes(ratio.key)) { ratio.value = null; ratio.reason = "Usulan pemetaan otomatis belum ditinjau Finance atau pemetaan telah berubah setelah tinjauan. Buka Pengaturan → Tinjauan pemetaan rasio."; } });
    return { company: { id: company.id, name: company.name }, period: { id: period.id, name: period.name }, basis, ratios,
      mappingPending,
      notes: [mappingPending ? "Pemetaan akun otomatis masih merupakan usulan. Finance perlu meninjau likuiditas, tenor, bunga dan pemisahan penjualan kredit di Pengaturan; rasio yang bergantung padanya belum dihitung." : "Pemetaan rasio mengikuti klasifikasi akun yang tersimpan; tinjau jika kebijakan atau substansi akun berubah.", "Rasio bersifat analitis dan mengikuti kualitas serta status finalisasi buku besar. Nilai negatif tetap ditampilkan bila penyebut positif.", "Tidak ada ambang industri universal. Perbandingan harus memakai sektor, metode, dan periode yang sepadan.", `${imports} dokumen impor dikecualikan dari tingkat penyelesaian workflow. Kasbon adalah kohor tanggal pengajuan pada periode ini, dengan penyelesaian terkini.`] };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
