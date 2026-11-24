import test from "node:test";
import assert from "node:assert/strict";
import { parseStatementText, continuityBreaks, rupiahCents } from "../src/lib/bank-statement";
import { matchLines } from "../src/lib/bank-reconciliation";
import { suggestRatioMapping, validateRatioMapping } from "../src/lib/ratio-mapping";

const sheet = (title: string, opening: string, rows: string[]) =>
  `PERIODE ${title},,,, Tanggal,Uraian, Debet , Kredit , Saldo Akhir ,Saldo Awal,,," ${opening} " ${rows.join(" ")} ,,,," X "`;

test("statement parser keeps printed balances, reports typing breaks and wrong sheet titles", () => {
  assert.equal(rupiahCents("Rp1,234.5"), 123450n);
  assert.equal(rupiahCents("Rp(36,906,751.67)"), -3690675167n);
  const text = [
    "PERIODE JANUARI 2026 s/d ,,,,",
    sheet("JANUARI 2026", "Rp100", ['5 January 2026,Trf dari A," Rp50 ",," Rp150 "', '6 January 2026,"Biaya, admin",," Rp10 "," Rp140 "']),
    sheet("FEBRUARI 2026", "Rp140", ['2 February 2026,Trf ke B,," Rp4 "," Rp136 "', '3 February 2026,Setor," Rp5 ",," Rp99 "']),
    sheet("APRIL 2026", "Rp99", ['1 March 2026,Bunga," Rp1 ",," Rp100 "']),
  ].join(" ");
  const s = parseStatementText(text);
  assert.deepEqual(s.map((x) => x.month), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(s[0].lines[1].description, "Biaya, admin");
  assert.equal(s[0].closing, 14000n);
  assert.equal(s[0].inflow, 5000n);
  assert.equal(s[0].outflow, 1000n);
  assert.deepEqual(s[1].breaks.map((b) => [b.row, b.printed, b.computed]), [[2, 9900n, 14100n]], "printed 99 where the rows give 141");
  assert.equal(s[2].titleMismatch, true, "sheet titled APRIL holds March rows");
  assert.deepEqual(continuityBreaks(s), [], "closing and next opening agree");
  const typo = parseStatementText(sheet("JANUARI 2026", "Rp10", ['5 January 2026,X," Rp1 ",," Rp11 "']) + " " + sheet("FEBRUARI 2026", "Rp1", ['2 February 2026,Y," Rp1 ",," Rp2 "']));
  assert.deepEqual(continuityBreaks(typo).map((b) => b.difference), [-1000n]);
});

test("matching is one-to-one on direction, exact amount and nearest date within three days", () => {
  const st = [
    { id: "s1", date: "2026-01-05", inflow: 100n, outflow: 0n },
    { id: "s2", date: "2026-01-05", inflow: 100n, outflow: 0n },
    { id: "s3", date: "2026-01-10", inflow: 0n, outflow: 70n },
    { id: "s4", date: "2026-01-20", inflow: 0n, outflow: 30n },
  ];
  const bk = [
    { id: "b1", date: "2026-01-06", inflow: 100n, outflow: 0n },
    { id: "b2", date: "2026-01-14", inflow: 0n, outflow: 70n },
    { id: "b3", date: "2026-01-20", inflow: 30n, outflow: 0n },
    { id: "b4", date: "2026-01-09", inflow: 0n, outflow: 70n },
  ];
  const r = matchLines(st, bk);
  assert.deepEqual(r.matched.map((m) => [m.statement.id, m.book.id]), [["s1", "b1"], ["s3", "b4"]]);
  assert.deepEqual(r.statementOnly.map((x) => x.id), ["s2", "s4"], "second identical receipt and opposite direction stay open");
  assert.deepEqual(r.bookOnly.map((x) => x.id).sort(), ["b2", "b3"], "beyond tolerance or wrong direction");
});

test("automatic ratio mapping follows the chart of accounts and passes validation", () => {
  const a = (id: string, code: string, name: string, category: string, isCash = false) => ({ id, code, name, category, isCash });
  const accounts = [
    a("kas", "11107", "Bank Mandiri", "ASET", true), a("ar", "11202", "Piutang Dagang", "ASET"), a("inv", "11206", "Persediaan bahan baku", "ASET"),
    a("ppn", "11211", "PPN Masukan", "ASET"), a("dta", "11214", "Aset Pajak Tangguhan", "ASET"), a("fa", "11404", "Kendaraan", "ASET"),
    a("sus", "99901", "Penampung", "ASET"), a("ap", "21101", "Hutang Dagang Suplier", "KEWAJIBAN"), a("loan", "21109", "Utang Pembiayaan", "KEWAJIBAN"),
    a("rev", "41101", "Pendapatan Jasa", "PENDAPATAN"), a("ret", "41103", "Retur dan Potongan Penjualan", "PENDAPATAN"), a("oth", "71101", "Pendapatan bunga", "PENDAPATAN"),
    a("int", "81108", "Beban Bunga Pembiayaan", "BEBAN"), a("tax", "81102", "Pajak atas pendapatan bunga", "BEBAN"),
  ];
  const m = suggestRatioMapping(accounts);
  assert.deepEqual(m.currentAssetIds.sort(), ["ar", "inv", "kas", "ppn"]);
  assert.deepEqual(m.quickAssetIds.sort(), ["ar", "kas"]);
  assert.deepEqual(m.currentLiabilityIds.sort(), ["ap", "loan"]);
  assert.deepEqual(m.interestBearingDebtIds, ["loan"]);
  assert.deepEqual(m.inventoryIds, ["inv"]);
  assert.deepEqual(m.receivableIds, ["ar"]);
  assert.deepEqual(m.creditSalesRevenueIds, ["rev"]);
  assert.deepEqual(m.interestExpenseIds, ["int"]);
  assert.deepEqual(validateRatioMapping(m, accounts), m);
});

test("finalisation bank check needs a statement through period end that equals the book balance", async () => {
  const { bankBalanceCheck } = await import("../src/lib/bank-reconciliation");
  const end = new Date("2026-10-31T00:00:00Z");
  const facts = (through: string, inflow: string) => ({
    findMany: async () => [
      { kind: "BANK_STATEMENT_PERIOD", effectiveDate: new Date("2026-09-01T00:00:00Z"), debit: null, credit: null, data: { opening: "100.00" } },
      { kind: "BANK_STATEMENT", effectiveDate: new Date(through + "T00:00:00Z"), debit: inflow, credit: "0.00", data: {} },
    ],
  });
  const rows = [
    { id: "b", code: "11107", name: "Bank Mandiri", isCash: true, net: "150.00" },
    { id: "k", code: "11101", name: "Kas Kecil", isCash: true, net: "5.00" },
  ];
  const tx = (f: ReturnType<typeof facts>) => ({ sourceFact: f }) as never;
  assert.deepEqual(await bankBalanceCheck(tx(facts("2026-10-20", "50.00")), "A", end, rows), { ok: true, detail: "Semua rekening cocok" });
  assert.match((await bankBalanceCheck(tx(facts("2026-10-20", "40.00")), "A", end, rows)).detail, /11107 selisih buku − koran 10.00/);
  assert.match((await bankBalanceCheck(tx(facts("2026-09-30", "50.00")), "A", end, rows)).detail, /11107 koran baru s.d. 2026-09/);
  assert.equal((await bankBalanceCheck(tx(facts("2026-10-20", "50.00")), "A", end, rows.map((r) => ({ ...r, net: "0.00" })))).ok, true, "no bank balance, nothing to reconcile");
});

test("statement parser accepts the weekday date format used in the BCA workbook", () => {
  const s = parseStatementText(`PERIODE JANUARI 2026,,,, Tanggal,Uraian, Debet , Kredit , Saldo Akhir ,Saldo Awal,,," Rp1,000 " "Monday, January 05, 2026",GMF," Rp500 ",," Rp1,500 " "Saturday, January 31, 2026",Biaya Adm,," Rp30 "," Rp1,470 "`);
  assert.deepEqual(s[0].lines.map((l) => [l.date, l.inflow, l.outflow]), [["2026-01-05", 50000n, 0n], ["2026-01-31", 0n, 3000n]]);
  assert.equal(s[0].breaks.length, 0);
});
