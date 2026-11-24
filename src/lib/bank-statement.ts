/**
 * Parser for the Finance "Jurnal rekening koran" workbooks (one sheet per month:
 * Tanggal, Uraian, Debet = uang masuk, Kredit = uang keluar, Saldo Akhir).
 * Input is the sheet text as exported by Google Drive (comma separated, amounts as "RpX").
 *
 * Nothing is guessed: every row keeps the balance printed on the statement, and the
 * running balance is re-computed so a typing error (a break between the printed and
 * the computed balance, or between one month's closing and the next month's opening)
 * is reported instead of silently corrected.
 */
const MONTHS: Record<string, number> = {
  january: 1, januari: 1, february: 2, februari: 2, march: 3, maret: 3, april: 4, may: 5, mei: 5, june: 6, juni: 6,
  july: 7, juli: 7, august: 8, agustus: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12, desember: 12,
};
export type StatementLine = { date: string; description: string; inflow: bigint; outflow: bigint; balance: bigint; row: number; computedBalance: bigint };
export type StatementSection = {
  index: number;
  title: string;
  month: string | null; // YYYY-MM from the row dates (sheet titles are sometimes copied wrongly)
  opening: bigint | null;
  closing: bigint | null;
  inflow: bigint;
  outflow: bigint;
  lines: StatementLine[];
  breaks: { row: number; printed: bigint; computed: bigint }[];
  titleMismatch: boolean;
};

/** "Rp1,234.50" / "-Rp5" → cents. */
export function rupiahCents(s: string): bigint {
  const t = s.replace(/["\s]/g, "");
  const neg = /^-|\(/.test(t);
  const digits = t.replace(/[^\d.]/g, "");
  if (!digits) throw new Error(`Nominal tidak terbaca: ${s}`);
  const [whole, dec = ""] = digits.split(".");
  const v = BigInt(whole || "0") * 100n + BigInt((dec + "00").slice(0, 2));
  return neg ? -v : v;
}
const isoDate = (d: string) => {
  const t = d.trim().replace(/^"|"$/g, "");
  const m = t.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/) ?? (() => {
    const us = t.match(/^[A-Za-z]+, ([A-Za-z]+) (\d{1,2}), (\d{4})$/); // "Monday, January 05, 2026"
    return us ? [us[0], us[2], us[1], us[3]] : null;
  })();
  if (!m || !MONTHS[m[2].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const AMT = String.raw`"\s*(-?Rp\(?[\d,.]+\)?)\s*"`;

export function parseStatementText(text: string): StatementSection[] {
  const heads = [...text.matchAll(/PERIODE ([A-Za-z]+) (\d{4})( s\/d)?/g)];
  const sections: StatementSection[] = [];
  heads.forEach((h, index) => {
    const body = text.slice(h.index!, index + 1 < heads.length ? heads[index + 1].index : text.length);
    const openMatch = body.match(new RegExp(`Saldo Awal,,,${AMT}`));
    const opening = openMatch ? rupiahCents(openMatch[1]) : null;
    const rowRe = new RegExp(String.raw`(\d{1,2} [A-Za-z]+ \d{4}|"[A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}"),((?:"[^"]*"|[^,"])*),(?:${AMT})?,(?:${AMT})?,${AMT}`, "g");
    const lines: StatementLine[] = [];
    const breaks: StatementSection["breaks"] = [];
    let running = opening ?? 0n;
    for (const m of body.matchAll(rowRe)) {
      const date = isoDate(m[1]);
      if (!date) continue;
      const inflow = m[3] ? rupiahCents(m[3]) : 0n,
        outflow = m[4] ? rupiahCents(m[4]) : 0n,
        balance = rupiahCents(m[5]);
      running += inflow - outflow;
      const row = lines.length + 1;
      if (running !== balance) {
        breaks.push({ row, printed: balance, computed: running });
        running = balance; // continue from the printed balance so one typo is reported once
      }
      lines.push({ date, description: m[2].replace(/^"|"$/g, "").trim(), inflow, outflow, balance, row, computedBalance: running });
    }
    const months = [...new Set(lines.map((l) => l.date.slice(0, 7)))].sort();
    const month = months.length ? months[months.length - 1] : null;
    const titleMonth = MONTHS[h[1].toLowerCase()];
    sections.push({
      index,
      title: h[0],
      month,
      opening,
      closing: lines.length ? lines[lines.length - 1].balance : opening,
      inflow: lines.reduce((s, l) => s + l.inflow, 0n),
      outflow: lines.reduce((s, l) => s + l.outflow, 0n),
      lines,
      breaks,
      titleMismatch: Boolean(month && titleMonth && Number(month.slice(5)) !== titleMonth),
    });
  });
  // Summary sheets ("PERIODE JANUARI 2026 s/d") carry no dated rows; drop them.
  return sections.filter((s) => s.lines.length > 0);
}

/** Breaks between a month's closing balance and the next month's opening balance. */
export function continuityBreaks(sections: StatementSection[]) {
  const sorted = [...sections].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const out: { from: string; to: string; closing: bigint; opening: bigint; difference: bigint }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (prev.closing !== null && cur.opening !== null && prev.closing !== cur.opening)
      out.push({ from: String(prev.month), to: String(cur.month), closing: prev.closing, opening: cur.opening, difference: cur.opening - prev.closing });
  }
  return out;
}
