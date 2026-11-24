import { createHash } from "node:crypto";
type Cell = string | number | boolean | null;
export function sourceMoney(value: Cell): string | null {
  if (value === null || typeof value === "boolean") return null;
  const text = String(value).trim(); if (!/^-?\d{1,15}(\.\d+)?$/.test(text)) return null;
  const [whole, decimals = ""] = text.replace("-", "").split("."), n = BigInt(whole) * 100n + BigInt(decimals.slice(0, 2).padEnd(2, "0")) + (Number(decimals[2] ?? "0") >= 5 ? 1n : 0n);
  return `${text.startsWith("-") ? "-" : ""}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
/** Stage changed business cells only; bank-account columns never enter the staging facts. */
export function invoiceRevisionRows(current: Cell[][], previous: Cell[][]) {
  const headers = current[2] ?? [], find = (pattern: RegExp) => headers.findIndex(h => typeof h === "string" && pattern.test(h));
  const invoice = find(/^no\.?\s*invoice$/i), client = find(/^nama client$/i), date = find(/^tgl\.?\s*invoice$/i), total = find(/^total$/i), sister = find(/^sister company$/i);
  if ([invoice, client, date, total, sister].some(i => i < 0)) throw new Error("Struktur sheet invoice berubah; periksa header sebelum impor.");
  const allowed = headers.flatMap((h, i) => h && !/bank pembayaran/i.test(String(h)) ? [i] : []);
  const rows = [];
  for (let i = 3; i < current.length; i++) {
    const row = current[i], old = previous[i] ?? [];
    if (allowed.every(c => (row[c] ?? null) === (old[c] ?? null))) continue;
    if (!String(row[invoice] ?? "").trim() && !String(row[client] ?? "").trim()) continue;
    const issuerNames: Record<string, string> = { "PT KUNCI BERKAH ABADI": "KBA", "PT KUNCI CIPTA GEMILANG": "KCG" };
    const issuerText = String(row[sister] ?? "").trim().toUpperCase().replace(/\s+/g, " "), issuer = issuerNames[issuerText] ?? issuerText, number = String(row[invoice] ?? "").trim();
    const prefix = number.match(/^(KBA|KCG|KCL|KBL)(?:\W|$)/i)?.[1].toUpperCase();
    const companyId = ["KBA", "KCG", "KCL", "KBL"].includes(issuer) && (!prefix || prefix === issuer) ? issuer : null;
    const sourceDate = String(row[date] ?? ""), candidateDate = /^20\d{2}-\d{2}-\d{2}(?:T00:00:00\.000Z)?$/.test(sourceDate) ? sourceDate.slice(0, 10) : null;
    const parsed = candidateDate ? new Date(candidateDate + "T00:00:00Z") : null;
    const effectiveDate = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidateDate ? candidateDate : null;
    const warnings = ["Revisi sumber; belum direkonsiliasi dan tidak mengubah jurnal atau saldo otomatis."];
    if (!companyId) warnings.push("Penerbit belum pasti atau berbeda dari prefix invoice; belum ditambahkan ke perusahaan operasional.");
    if (!effectiveDate) warnings.push("Tanggal invoice kosong/tidak pasti; pertahankan teks asli.");
    const amount = sourceMoney(row[total] ?? null); if (amount === null) warnings.push("Total kosong/bukan angka; tidak dianggap nol.");
    const cells = Object.fromEntries(allowed.map(c => [String(c + 1), row[c] ?? null]));
    const changedColumns = allowed.filter(c => (row[c] ?? null) !== (old[c] ?? null)).map(c => String(headers[c]));
    rows.push({ row: i + 1, companyId, documentNumber: number || null, effectiveDate, amount, data: { cells, changedColumns, warnings, sourceVerification: "UNVERIFIED", contentHash: createHash("sha256").update(JSON.stringify(cells)).digest("hex") } });
  }
  return { headers: Object.fromEntries(allowed.map(c => [String(c + 1), headers[c]])), rows };
}
