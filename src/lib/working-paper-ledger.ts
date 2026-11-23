/**
 * Posts the accountant's working paper (Kertas Kerja Akuntansi KBA 2026, sheet JURNAL)
 * to the general ledger. Each JV-* voucher becomes one journal entry; nothing is
 * rearranged or invented:
 * - JV-SA → OPENING (2025 comparative balances), JV-AJ → ADJUSTING, everything else → GENERAL.
 * - Cash-flow activity is derived from the counter-accounts of a cash voucher.
 * - Suspense accounts (99901–99903) from the working paper are added to the COA
 *   exactly as named in the source, so their balance is visible on the balance sheet.
 */
export type FactLine = {
  documentNumber: string;
  date: string; // YYYY-MM-DD
  accountCode: string;
  debit: string;
  credit: string;
  description: string;
  title: string; // voucher type in the source (e.g. "PENGELUARAN KAS")
  estimate: boolean;
  cashTag?: string; // cash-flow tag set by the accountant (column 12), e.g. "OPS-PEMASOK"
};
/**
 * The accountant's cash-flow tags → ERP activity. PNP-TIDAKDIKENAL (unidentified payee,
 * finding T06) is classified as operating until identified.
 */
export function activityFromTag(tag: string | undefined): PlannedVoucher["cashActivity"] {
  if (!tag) return undefined;
  if (tag.startsWith("INV-")) return "INVESTING";
  if (tag.startsWith("FIN-") || tag === "PNP-PINJAMAN") return "FINANCING";
  if (tag.startsWith("OPS-") || tag === "KAS-INTERNAL" || tag === "PNP-TIDAKDIKENAL") return "OPERATING";
  return undefined;
}
export type PlannedVoucher = {
  number: string;
  date: string;
  type: "OPENING" | "ADJUSTING" | "GENERAL";
  cashActivity?: "OPERATING" | "INVESTING" | "FINANCING";
  description: string;
  estimate: boolean;
  lines: { accountCode: string; debit: string; credit: string; description: string }[];
};

/** The date window booked from the working paper (company.settings.historicalLedger), if any. */
export function historicalWindow(settings: unknown) {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>).historicalLedger : null;
  if (!s || typeof s !== "object") return null;
  const h = s as Record<string, unknown>;
  const from = String(h.from ?? ""), through = String(h.through ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) return null;
  return { from, through, source: String(h.source ?? "kertas kerja"), periodId: String(h.periodId ?? "") };
}
export function inWindow(w: { from: string; through: string }, date: Date) {
  const d = date.toISOString().slice(0, 10);
  return d >= w.from && d <= w.through;
}

export const SUSPENSE_ACCOUNTS = [
  { code: "99901", name: "Penampung: Pembayaran Pinjaman, Gadai, Investor", category: "ASET", normalBalance: "DEBIT" },
  { code: "99902", name: "Penampung: Penerima Tidak Teridentifikasi", category: "ASET", normalBalance: "DEBIT" },
  { code: "99903", name: "Penampung: Selisih Saldo Awal dan Penerimaan", category: "KEWAJIBAN", normalBalance: "KREDIT" },
] as const;

/** Investing: fixed/intangible assets and loans given to affiliates/shareholders. */
const INVESTING = /^(114\d\d|11106|11110)$/;
/** Financing: financing debt, equity, and payments of loans/pawns/investors (99901). */
const FINANCING = /^(21109|22\d\d\d|31\d\d\d|99901)$/;

const toCents = (v: string) => {
  const [a, b = ""] = v.trim().split(".");
  const neg = a.startsWith("-");
  const n = BigInt(a.replace("-", "") || "0") * 100n + BigInt((b + "00").slice(0, 2));
  return neg ? -n : n;
};

export function cashActivity(
  lines: { accountCode: string }[],
  cashCodes: Set<string>,
): PlannedVoucher["cashActivity"] {
  if (!lines.some((l) => cashCodes.has(l.accountCode))) return undefined;
  const others = lines.filter((l) => !cashCodes.has(l.accountCode)).map((l) => l.accountCode);
  if (others.some((c) => FINANCING.test(c))) return "FINANCING";
  if (others.some((c) => INVESTING.test(c))) return "INVESTING";
  return "OPERATING";
}

export function planVouchers(facts: FactLine[], cashCodes: Set<string>) {
  const groups = new Map<string, FactLine[]>();
  for (const f of facts) groups.set(f.documentNumber, [...(groups.get(f.documentNumber) ?? []), f]);
  const vouchers: PlannedVoucher[] = [];
  const problems: string[] = [];
  for (const [number, rows] of groups) {
    const dates = new Set(rows.map((r) => r.date));
    if (dates.size !== 1) problems.push(`${number}: lebih dari satu tanggal`);
    const debit = rows.reduce((s, r) => s + toCents(r.debit), 0n),
      credit = rows.reduce((s, r) => s + toCents(r.credit), 0n);
    if (debit !== credit) problems.push(`${number}: tidak seimbang (${debit} ≠ ${credit})`);
    const lines = rows
      .filter((r) => toCents(r.debit) !== 0n || toCents(r.credit) !== 0n)
      .map((r) => ({ accountCode: r.accountCode, debit: r.debit, credit: r.credit, description: r.description.slice(0, 500) }));
    if (!lines.length) {
      problems.push(`${number}: tanpa nilai (dilewati)`);
      continue;
    }
    const type = number.startsWith("JV-SA") ? "OPENING" : number.startsWith("JV-AJ") ? "ADJUSTING" : "GENERAL";
    // The source flags estimates per line; suspense (999xx) lines carry the flag too,
    // but they are unidentified items, not estimates — label them separately.
    const suspense = rows.some((r) => r.accountCode.startsWith("999") && (Number(r.debit) || Number(r.credit)));
    const estimate = rows.some((r) => r.estimate && !r.accountCode.startsWith("999"));
    vouchers.push({
      number,
      date: [...dates].sort()[0],
      type,
      cashActivity:
        type === "OPENING" || !lines.some((l) => cashCodes.has(l.accountCode))
          ? undefined
          : (activityFromTag(rows.find((r) => cashCodes.has(r.accountCode))?.cashTag) ?? cashActivity(lines, cashCodes)),
      estimate,
      description: `${number} · ${rows[0].title}${estimate ? " · ESTIMASI" : ""}${suspense ? " · PENAMPUNG" : ""} · ${rows[0].description}`.slice(0, 480),
      lines,
    });
  }
  vouchers.sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date.localeCompare(b.date)));
  // The opening balance must be the period's first entry.
  vouchers.sort((a, b) => (a.type === "OPENING" ? -1 : b.type === "OPENING" ? 1 : 0));
  return { vouchers, problems };
}
