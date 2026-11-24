import { Prisma } from "@prisma/client";
import { db } from "./db";
import { reports } from "./accounting";
import { amount, cents, signedCents } from "./money";
import { historicalWindow } from "./working-paper-ledger";
import { finalizationStatus } from "./finalization";

/**
 * Management report for one fiscal period. Every number comes from the posted ledger
 * (the same reports() used by the financial statements). The working paper only
 * supplies account grouping (HPP / operating expense / other / tax) and the
 * audit findings (TEMUAN) and control checks (CEK) it contains.
 */
type Group = "PENDAPATAN" | "HPP" | "BEBAN" | "LAIN" | "PAJAK";
export const groupLabel: Record<Group, string> = {
  PENDAPATAN: "Pendapatan usaha",
  HPP: "Beban pokok pendapatan (HPP)",
  BEBAN: "Beban usaha",
  LAIN: "Pendapatan/(beban) lain-lain",
  PAJAK: "Beban pajak penghasilan",
};
const pct = (part: bigint, whole: bigint) =>
  whole === 0n ? null : Number((part * 10000n) / whole) / 100;
const rp = (v: bigint) =>
  `Rp${(Number(v) / 100).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
const monthName = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

export function groupOf(code: string, category: string, map: Map<string, string>): Group | null {
  if (category === "PENDAPATAN") return map.get(code) === "LAIN" ? "LAIN" : "PENDAPATAN";
  if (category !== "BEBAN") return null;
  const g = map.get(code);
  if (g === "HPP" || g === "LAIN" || g === "PAJAK") return g;
  if (g === "BEBAN") return "BEBAN";
  return code.startsWith("8") ? "LAIN" : code.startsWith("9") ? "PAJAK" : "BEBAN";
}

export async function managementReport(companyId: string, periodId?: string) {
  return db.$transaction(
    async (tx) => {
      const periods = await tx.fiscalPeriod.findMany({ where: { companyId }, orderBy: { startDate: "desc" } });
      const booked = await tx.journalEntry.groupBy({ by: ["fiscalPeriodId"], where: { companyId, status: "POSTED" } });
      const period =
        periods.find((p) => p.id === periodId) ??
        periods.find((p) => booked.some((b) => b.fiscalPeriodId === p.id)) ??
        periods[0];
      if (!period) throw new Error("Perusahaan belum memiliki periode fiskal.");
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const r = await reports(tx, period.id);
      const mapRows = await tx.$queryRaw<{ code: string; g: string | null }[]>(
        Prisma.sql`SELECT DISTINCT data->>'accountCode' AS code, data->>'16' AS g FROM source_facts WHERE "companyId"=${companyId} AND kind='FINANCIAL_JOURNAL'`,
      );
      const map = new Map(mapRows.filter((m) => m.code && m.g).map((m) => [m.code, String(m.g)]));

      // Profit & loss by group (credit-positive for revenue, debit-positive for costs).
      const totals: Record<Group, bigint> = { PENDAPATAN: 0n, HPP: 0n, BEBAN: 0n, LAIN: 0n, PAJAK: 0n };
      const expenseAccounts: { code: string; name: string; group: Group; value: bigint }[] = [];
      for (const row of r.rows) {
        const g = groupOf(row.code, row.category, map);
        if (!g) continue;
        const net = signedCents(row.net); // debit − credit
        if (g === "PENDAPATAN") totals.PENDAPATAN += -net;
        else if (g === "LAIN") totals.LAIN += -net; // income positive, expense negative
        else totals[g] += net;
        if (g !== "PENDAPATAN" && net !== 0n) expenseAccounts.push({ code: row.code, name: row.name, group: g, value: net });
      }
      const grossProfit = totals.PENDAPATAN - totals.HPP,
        operatingProfit = grossProfit - totals.BEBAN,
        preTax = operatingProfit + totals.LAIN,
        netProfit = preTax - totals.PAJAK;

      // Monthly trend (excluding opening and closing entries).
      const monthly = await tx.$queryRaw<{ m: string; code: string; category: string; net: string }[]>(
        Prisma.sql`SELECT to_char(e.transaction_date,'YYYY-MM') AS m, a.code, a.category::text AS category, SUM(l.debit-l.credit)::text AS net
          FROM journal_entries e JOIN journal_lines l ON l.journal_entry_id=e.id JOIN chart_of_accounts a ON a.id=l.account_id
          WHERE e.fiscal_period_id=${period.id} AND e.status='POSTED' AND e.type NOT IN ('OPENING','CLOSING') AND a.category IN ('PENDAPATAN','BEBAN')
          GROUP BY 1,2,3 ORDER BY 1`,
      );
      const adjustments = await tx.$queryRaw<{ m: string; total: string }[]>(
        Prisma.sql`SELECT to_char(e.transaction_date,'YYYY-MM') AS m, SUM(l.debit)::text AS total FROM journal_entries e JOIN journal_lines l ON l.journal_entry_id=e.id
          WHERE e.fiscal_period_id=${period.id} AND e.status='POSTED' AND e.type='ADJUSTING' AND e.description LIKE '%ESTIMASI%' GROUP BY 1`,
      );
      const months = new Map<string, { revenue: bigint; cogs: bigint; opex: bigint; other: bigint; tax: bigint }>();
      for (const x of monthly) {
        const g = groupOf(x.code, x.category, map);
        if (!g) continue;
        const m = months.get(x.m) ?? { revenue: 0n, cogs: 0n, opex: 0n, other: 0n, tax: 0n };
        const n = signedCents(x.net);
        if (g === "PENDAPATAN") m.revenue += -n;
        else if (g === "HPP") m.cogs += n;
        else if (g === "BEBAN") m.opex += n;
        else if (g === "LAIN") m.other += -n;
        else m.tax += n;
        months.set(x.m, m);
      }
      const trend = [...months.entries()].map(([month, m]) => ({
        month,
        label: monthName(month),
        revenue: amount(m.revenue),
        cogs: amount(m.cogs),
        opex: amount(m.opex),
        net: amount(m.revenue - m.cogs - m.opex + m.other - m.tax),
      }));

      // Positions at period end.
      const cashRows = r.rows.filter((x) => x.isCash && signedCents(x.net) !== 0n);
      const cash = cashRows.reduce((s, x) => s + signedCents(x.net), 0n);
      const suspense = r.rows.filter((x) => x.code.startsWith("999") && signedCents(x.net) !== 0n);
      const suspenseTotal = suspense.reduce((s, x) => s + signedCents(x.net), 0n);
      // Estimates are the balances of accounts the working paper designates as estimates.
      const estimateRows = r.rows.filter((x) => /estimasi/i.test(x.name) && signedCents(x.net) !== 0n);
      const estimateTotal = estimateRows.reduce((s, x) => s + (signedCents(x.net) < 0n ? -signedCents(x.net) : signedCents(x.net)), 0n);
      const counts = await tx.journalEntry.groupBy({ by: ["type"], where: { fiscalPeriodId: period.id, status: "POSTED" }, _count: true });

      // Findings and control checks from the working paper.
      const control = await tx.sourceFact.findMany({ where: { companyId, kind: "CONTROL" }, orderBy: { row: "asc" }, select: { sheet: true, data: true } });
      const cell = (d: unknown, k: string) => String(((d as Record<string, unknown>)?.cells as Record<string, unknown> | undefined)?.[k] ?? "");
      const findings = control.filter((c) => c.sheet === "TEMUAN" && cell(c.data, "1")).map((c) => ({
        code: cell(c.data, "1"), issue: cell(c.data, "2"), amount: cell(c.data, "3"), severity: cell(c.data, "4"),
        basis: cell(c.data, "5"), action: cell(c.data, "6"), owner: cell(c.data, "7"), due: cell(c.data, "8"),
      }));
      const checks = control.filter((c) => c.sheet === "CEK" && /^C\d+/.test(cell(c.data, "1")));
      const checksOk = checks.filter((c) => cell(c.data, "4") === "OK").length;
      const pending = await tx.businessRecord.groupBy({ by: ["module", "status"], where: { companyId, status: { in: ["IMPORTED", "DRAFT", "SUBMITTED", "APPROVED"] } }, _count: true });
      const history = historicalWindow(company.settings);
      const final = await finalizationStatus(companyId, period.id, tx);
      const stateLabel = { FINAL: "FINAL", FINAL_WITH_EXCEPTIONS: "FINAL DENGAN PENGECUALIAN", DRAFT: "DRAFT - BELUM FINAL" }[final.state as "FINAL" | "FINAL_WITH_EXCEPTIONS" | "DRAFT"];

      // Narrative, generated from the numbers above.
      const narrative: string[] = [];
      const top = [...expenseAccounts].filter((e) => e.group !== "PAJAK").sort((a, b) => (b.value > a.value ? 1 : -1)).slice(0, 3);
      if (totals.PENDAPATAN === 0n && !trend.length)
        narrative.push(`Belum ada jurnal pendapatan atau beban yang diposting pada periode ${period.name}. Laporan akan terisi setelah transaksi diverifikasi dan diposting.`);
      else {
        narrative.push(`Periode ${period.name}: pendapatan usaha ${rp(totals.PENDAPATAN)}, HPP ${rp(totals.HPP)} sehingga laba kotor ${rp(grossProfit)}${pct(grossProfit, totals.PENDAPATAN) !== null ? ` (margin ${pct(grossProfit, totals.PENDAPATAN)}%)` : ""}. Setelah beban usaha ${rp(totals.BEBAN)}, lain-lain ${rp(totals.LAIN)} dan pajak ${rp(totals.PAJAK)}, ${netProfit >= 0n ? "laba" : "rugi"} bersih ${rp(netProfit < 0n ? -netProfit : netProfit)}.`);
        if (trend.length > 1) {
          const best = [...trend].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0],
            low = [...trend].sort((a, b) => Number(a.revenue) - Number(b.revenue))[0];
          narrative.push(`Pendapatan tertinggi pada ${best.label} (${rp(signedCents(best.revenue))}) dan terendah pada ${low.label} (${rp(signedCents(low.revenue))}).`);
          const worst = [...trend].sort((a, b) => Number(a.net) - Number(b.net))[0];
          const adjusted = adjustments.find((a) => a.m === worst.month);
          if (Number(worst.net) < 0)
            narrative.push(`Hasil bulanan terendah pada ${worst.label} (${rp(signedCents(worst.net))})${adjusted ? `; bulan ini memuat jurnal penyesuaian bertanda estimasi sebesar ${rp(signedCents(adjusted.total))}, sehingga angka bulanan tidak mencerminkan kinerja operasional bulan itu saja` : ""}.`);
        }
        if (top.length) narrative.push(`Pos biaya terbesar: ${top.map((t) => `${t.name} ${rp(t.value)}`).join("; ")}.`);
        if (estimateTotal > 0n) narrative.push(`Laporan memuat estimasi sebesar ${rp(estimateTotal)} (${estimateRows.map((x) => `${x.name} ${rp(signedCents(x.net) < 0n ? -signedCents(x.net) : signedCents(x.net))}`).join("; ")}). Estimasi harus diganti angka aktual (payroll, BPJS, PPh) sebelum laporan final.`);
      }
      narrative.push(`Kas dan setara kas akhir periode ${rp(cash)}${cash < 0n ? " (negatif — rekonsiliasi rekening koran diperlukan)" : ""}. Piutang usaha ${rp(signedCents(r.receivables))}, utang usaha ${rp(signedCents(r.payables))}.`);
      if (suspenseTotal !== 0n) narrative.push(`Akun penampung masih bersaldo ${rp(suspenseTotal)} (${suspense.map((s) => s.code).join(", ")}); saldo ini menunggu identifikasi dan reklasifikasi.`);
      if (signedCents(r.balanceDifference) !== 0n) narrative.push(`Perhatian: neraca tidak seimbang sebesar ${rp(signedCents(r.balanceDifference))}.`);
      if (history) narrative.push(`Periode ${history.from} s.d. ${history.through} dibukukan dari ${history.source}. Laporan belum diaudit.`);
      if (final.applies && final.state === "DRAFT") narrative.push(`Status laporan: DRAFT. Belum final karena: ${final.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`);
      if (findings.length) narrative.push(`${findings.length} temuan kertas kerja perlu ditindaklanjuti; ${findings.filter((f) => f.severity === "T").length} berstatus T (tinggi).`);

      return {
        company: { id: company.id, name: company.name },
        period: { id: period.id, name: period.name, status: period.status, start: period.startDate, end: period.endDate },
        periods: periods.map((p) => ({ id: p.id, name: p.name, status: p.status })),
        status: stateLabel,
        finalization: { state: final.state, checks: final.checks, applies: final.applies },
        basis: history ? `Buku besar; ${history.source} (belum diaudit)` : "Buku besar yang diposting",
        profitLoss: {
          revenue: amount(totals.PENDAPATAN), cogs: amount(totals.HPP), grossProfit: amount(grossProfit),
          grossMargin: pct(grossProfit, totals.PENDAPATAN), opex: amount(totals.BEBAN), operatingProfit: amount(operatingProfit),
          other: amount(totals.LAIN), preTax: amount(preTax), tax: amount(totals.PAJAK), netProfit: amount(netProfit),
          netMargin: pct(netProfit, totals.PENDAPATAN),
        },
        position: {
          cash: amount(cash), receivables: r.receivables, payables: r.payables, assets: r.assets,
          liabilities: r.liabilities, equity: r.equity, balanceDifference: r.balanceDifference,
          suspense: suspense.map((s) => ({ code: s.code, name: s.name, balance: amount(signedCents(s.net)) })),
          estimates: amount(estimateTotal),
          estimateAccounts: estimateRows.map((x) => ({ code: x.code, name: x.name, balance: amount(signedCents(x.net) < 0n ? -signedCents(x.net) : signedCents(x.net)) })),
        },
        cashFlow: r.cash,
        trend,
        topExpenses: [...expenseAccounts].sort((a, b) => (b.value > a.value ? 1 : -1)).slice(0, 10)
          .map((e) => ({ code: e.code, name: e.name, group: groupLabel[e.group], value: amount(e.value) })),
        ledger: {
          entries: Object.fromEntries(counts.map((c) => [c.type, c._count])),
          trialDebit: r.trialDebit, trialCredit: r.trialCredit,
        },
        controls: { total: checks.length, ok: checksOk },
        findings,
        pendingDocuments: pending.map((p) => ({ module: p.module, status: p.status, count: p._count })),
        narrative,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60000 },
  );
}
