export function cents(value: string | { toString(): string }): bigint {
  const s = value.toString();
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s))
    throw new Error(
      "Nilai harus positif, maksimum 13 digit dan 2 desimal. Gunakan titik desimal.",
    );
  const [whole, decimal = ""] = s.split(".");
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
}
export function amount(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return `${sign}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
export const signedCents = (v: { toString(): string } | string) =>
  v.toString().startsWith("-") ? -cents(v.toString().slice(1)) : cents(v);
export function rupiah(v: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
  }).format(Number(v));
}
export type InputLine = {
  accountId: string;
  description?: string;
  debit: string;
  credit: string;
};
export function validateLines(lines: InputLine[]) {
  if (lines.length < 2 || lines.length > 200)
    throw new Error("Jurnal membutuhkan 2–200 baris akun.");
  let debit = 0n,
    credit = 0n;
  for (const l of lines) {
    const d = cents(l.debit),
      c = cents(l.credit);
    if (d > 0n === c > 0n)
      throw new Error(
        "Setiap baris wajib memiliki satu nilai: debit atau kredit.",
      );
    debit += d;
    credit += c;
  }
  if (debit !== credit)
    throw new Error(
      `Jurnal tidak seimbang. Selisih ${amount(debit - credit)}.`,
    );
  return { debit: amount(debit), credit: amount(credit) };
}
