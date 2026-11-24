/**
 * Bank reconciliation: statement lines (BANK_STATEMENT source facts imported from the
 * Finance "Jurnal rekening koran" workbooks) against the posted ledger lines of the same
 * cash account.
 *
 * Matching is deliberately strict and explainable: same direction, same amount to the
 * cent, transaction dates at most `toleranceDays` apart, one statement line to one ledger
 * line, nearest date first. Everything not matched is listed on its own side so Finance
 * can book what is missing (bank-only items) or investigate what the bank never saw
 * (book-only items). Nothing is booked automatically.
 */
import { db } from "./db";
import { amount, cents } from "./money";
import { requireFinancialScope } from "./financial-trace";
import type { Actor } from "./auth";

export type Side = { id: string; date: string; inflow: bigint; outflow: bigint };
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000;

/** One-to-one match on direction + exact amount within the date tolerance, nearest date first. */
export function matchLines<S extends Side, B extends Side>(statement: S[], book: B[], toleranceDays = 3) {
  const pool = new Map<string, B[]>();
  for (const b of book) {
    const key = b.inflow > 0n ? `I${b.inflow}` : `O${b.outflow}`;
    pool.set(key, [...(pool.get(key) ?? []), b]);
  }
  const matched: { statement: S; book: B; days: number }[] = [];
  const statementOnly: S[] = [];
  for (const s of [...statement].sort((a, b) => a.date.localeCompare(b.date))) {
    if (s.inflow === 0n && s.outflow === 0n) continue;
    const key = s.inflow > 0n ? `I${s.inflow}` : `O${s.outflow}`;
    const candidates = pool.get(key) ?? [];
    let best = -1, bestDays = Infinity;
    candidates.forEach((c, i) => {
      const d = dayDiff(s.date, c.date);
      if (d <= toleranceDays && d < bestDays) { best = i; bestDays = d; }
    });
    if (best < 0) statementOnly.push(s);
    else {
      matched.push({ statement: s, book: candidates[best], days: bestDays });
      candidates.splice(best, 1);
    }
  }
  const used = new Set(matched.map((m) => m.book.id));
  return { matched, statementOnly, bookOnly: book.filter((b) => !used.has(b.id) && (b.inflow !== 0n || b.outflow !== 0n)) };
}

const sum = (xs: Side[], k: "inflow" | "outflow") => xs.reduce((s, x) => s + x[k], 0n);

export async function bankReconciliation(actor: Actor, companyId: string, periodId: string, accountId?: string) {
  requireFinancialScope(actor, companyId);
  const period = await db.fiscalPeriod.findFirstOrThrow({ where: { id: periodId, companyId } });
  const from = period.startDate, to = period.endDate;
  const covered = await db.sourceFact.groupBy({ by: ["accountId"], where: { companyId, kind: "BANK_STATEMENT" }, _count: true });
  const cashAccounts = await db.account.findMany({ where: { isCash: true }, orderBy: { code: "asc" } });
  // Book balance of every cash account in the period, to show which accounts still lack a statement.
  const bookTotals = await db.journalLine.groupBy({
    by: ["accountId"],
    where: { account: { isCash: true }, entry: { companyId, fiscalPeriodId: period.id, status: "POSTED", type: { not: "CLOSING" } } },
    _sum: { debit: true, credit: true },
  });
  const coverage = cashAccounts
    .map((a) => {
      const t = bookTotals.find((b) => b.accountId === a.id);
      const balance = t ? cents(t._sum.debit?.toString() ?? "0") - cents(t._sum.credit?.toString() ?? "0") : 0n;
      return { id: a.id, code: a.code, name: a.name, bookBalance: amount(balance), statementLines: covered.find((c) => c.accountId === a.id)?._count ?? 0 };
    })
    .filter((a) => a.statementLines > 0 || a.bookBalance !== "0.00");
  const selected = accountId ?? coverage.find((c) => c.statementLines > 0)?.id;
  if (!selected) return { period: { id: period.id, name: period.name }, coverage, account: null };
  const account = cashAccounts.find((a) => a.id === selected);
  if (!account) throw new Error("Akun bukan akun kas/bank.");

  const [facts, periods, lines, file] = await Promise.all([
    db.sourceFact.findMany({ where: { companyId, kind: "BANK_STATEMENT", accountId: account.id, effectiveDate: { gte: from, lte: to } }, orderBy: [{ effectiveDate: "asc" }, { sheet: "asc" }, { row: "asc" }] }),
    db.sourceFact.findMany({ where: { companyId, kind: "BANK_STATEMENT_PERIOD", accountId: account.id }, orderBy: { effectiveDate: "asc" } }),
    db.journalLine.findMany({
      where: { accountId: account.id, entry: { companyId, fiscalPeriodId: period.id, status: "POSTED", type: { notIn: ["CLOSING"] } } },
      include: { entry: { select: { id: true, journalNumber: true, transactionDate: true, description: true, type: true } } },
    }),
    db.sourceFact.findFirst({ where: { companyId, kind: "BANK_STATEMENT", accountId: account.id }, select: { sourceFileId: true } }),
  ]);
  const source = file ? await db.sourceFile.findFirst({ where: { id: file.sourceFileId, companyId }, select: { id: true, name: true, url: true } }) : null;
  const statement = facts.map((f) => ({
    id: f.id, date: f.effectiveDate!.toISOString().slice(0, 10), inflow: cents(f.debit?.toString() ?? "0"), outflow: cents(f.credit?.toString() ?? "0"),
    description: String((f.data as Record<string, unknown>).description ?? ""), sheet: f.sheet, row: f.row,
  }));
  const opening = lines.filter((l) => l.entry.type === "OPENING");
  const book = lines
    .filter((l) => l.entry.type !== "OPENING")
    .map((l) => ({
      id: l.id, date: l.entry.transactionDate.toISOString().slice(0, 10), inflow: cents(l.debit.toString()), outflow: cents(l.credit.toString()),
      journalId: l.entry.id, journalNumber: l.entry.journalNumber, description: l.description || l.entry.description,
    }));
  const { matched, statementOnly, bookOnly } = matchLines(statement, book);
  const statementMonths = periods.map((p) => p.data as Record<string, string | null>);
  const firstOpening = statementMonths.find((m) => m.opening !== null)?.opening;
  const months = [...new Set([...statement, ...book].map((x) => x.date.slice(0, 7)))].sort();
  let stmtBalance = firstOpening ? cents(firstOpening.replace("-", "")) * (firstOpening.startsWith("-") ? -1n : 1n) : 0n;
  let bookBalance = opening.reduce((s, l) => s + cents(l.debit.toString()) - cents(l.credit.toString()), 0n);
  const bookOpening = bookBalance, statementOpening = stmtBalance;
  const perMonth = months.map((m) => {
    const st = statement.filter((x) => x.date.startsWith(m)), bk = book.filter((x) => x.date.startsWith(m));
    stmtBalance += sum(st, "inflow") - sum(st, "outflow");
    bookBalance += sum(bk, "inflow") - sum(bk, "outflow");
    const printed = statementMonths.find((x) => x.month === m);
    const mm = matched.filter((x) => x.statement.date.startsWith(m));
    return {
      month: m,
      statement: { inflow: amount(sum(st, "inflow")), outflow: amount(sum(st, "outflow")), closingComputed: st.length ? amount(stmtBalance) : null, closingPrinted: printed?.closing ?? null, lines: st.length },
      book: { inflow: amount(sum(bk, "inflow")), outflow: amount(sum(bk, "outflow")), closing: amount(bookBalance), lines: bk.length },
      difference: st.length ? amount(bookBalance - stmtBalance) : null,
      matched: mm.length,
      statementOnly: statementOnly.filter((x) => x.date.startsWith(m)).length,
      bookOnly: bookOnly.filter((x) => x.date.startsWith(m)).length,
    };
  });
  const lastStatement = statement.at(-1)?.date ?? null;
  const out = (x: { inflow: bigint; outflow: bigint }) => ({ inflow: amount(x.inflow), outflow: amount(x.outflow) });
  return {
    period: { id: period.id, name: period.name, end: to.toISOString().slice(0, 10) },
    coverage,
    account: { id: account.id, code: account.code, name: account.name },
    source: source ? { ...source, url: /^https:\/\//.test(source.url) ? source.url : null } : null,
    statementThrough: lastStatement,
    coversPeriodEnd: Boolean(lastStatement && lastStatement.slice(0, 7) === to.toISOString().slice(0, 7)),
    opening: { statement: amount(statementOpening), book: amount(bookOpening) },
    totals: {
      statement: out({ inflow: sum(statement, "inflow"), outflow: sum(statement, "outflow") }),
      book: out({ inflow: sum(book, "inflow"), outflow: sum(book, "outflow") }),
      matched: matched.length, matchedAmount: amount(matched.reduce((s, m) => s + m.statement.inflow + m.statement.outflow, 0n)),
      statementOnly: statementOnly.length, statementOnlyAmount: amount(statementOnly.reduce((s, x) => s + x.inflow - x.outflow, 0n)),
      bookOnly: bookOnly.length, bookOnlyAmount: amount(bookOnly.reduce((s, x) => s + x.inflow - x.outflow, 0n)),
    },
    breaks: statementMonths.filter((m, i) => i > 0 && m.opening !== null && statementMonths[i - 1].closing !== null && m.opening !== statementMonths[i - 1].closing)
      .map((m) => ({ month: m.month, opening: m.opening, previousClosing: statementMonths[statementMonths.indexOf(m) - 1].closing })),
    titleMismatches: periods.filter((p) => (p.data as Record<string, unknown>).titleMismatch).map((p) => `${p.sheet} berisi ${(p.data as Record<string, unknown>).month}`),
    perMonth,
    statementOnly: statementOnly.map((x) => ({ id: x.id, date: x.date, description: x.description, ...out(x), sheet: x.sheet, row: x.row })),
    bookOnly: bookOnly.map((x) => ({ id: x.id, date: x.date, description: x.description, ...out(x), journalId: x.journalId, journalNumber: x.journalNumber })),
    matchedSample: matched.slice(0, 20).map((m) => ({ date: m.statement.date, days: m.days, ...out(m.statement), journalId: m.book.journalId, journalNumber: m.book.journalNumber, description: m.statement.description })),
    rule: "Cocok bila arah dan nominal sama persis dan selisih tanggal ≤ 3 hari (satu baris koran untuk satu baris buku). Tidak ada jurnal yang dibuat otomatis.",
  };
}

/** Finalisation check: every bank account with a book balance reconciles to its statement at period end. */
export async function bankBalanceCheck(
  tx: Pick<typeof db, "sourceFact">,
  companyId: string,
  periodEnd: Date,
  rows: { id: string; code: string; name: string; isCash: boolean; net: string }[],
) {
  const banks = rows.filter((r) => r.isCash && !/^kas\b/i.test(r.name) && r.net !== "0.00");
  const issues: string[] = [];
  for (const b of banks) {
    const facts = await tx.sourceFact.findMany({ where: { companyId, accountId: b.id, kind: { in: ["BANK_STATEMENT", "BANK_STATEMENT_PERIOD"] }, effectiveDate: { lte: periodEnd } }, select: { kind: true, effectiveDate: true, debit: true, credit: true, data: true }, orderBy: { effectiveDate: "asc" } });
    const lines = facts.filter((f) => f.kind === "BANK_STATEMENT");
    if (!lines.length) { issues.push(`${b.code} belum ada rekening koran`); continue; }
    const last = lines.at(-1)!.effectiveDate!.toISOString().slice(0, 7);
    if (last !== periodEnd.toISOString().slice(0, 7)) { issues.push(`${b.code} koran baru s.d. ${last}`); continue; }
    const first = facts.find((f) => f.kind === "BANK_STATEMENT_PERIOD")?.data as Record<string, string | null> | undefined;
    const open = first?.opening ? (first.opening.startsWith("-") ? -cents(first.opening.slice(1)) : cents(first.opening)) : 0n;
    const closing = lines.reduce((s, l) => s + cents(l.debit?.toString() ?? "0") - cents(l.credit?.toString() ?? "0"), open);
    const book = b.net.startsWith("-") ? -cents(b.net.slice(1)) : cents(b.net);
    if (closing !== book) issues.push(`${b.code} selisih buku − koran ${amount(book - closing)}`);
  }
  return { ok: issues.length === 0, detail: issues.join("; ") || (banks.length ? "Semua rekening cocok" : "Tidak ada rekening bank bersaldo") };
}
