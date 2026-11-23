import { test } from "node:test";
import assert from "node:assert/strict";
import { planVouchers, activityFromTag, historicalWindow, inWindow, type FactLine } from "../src/lib/working-paper-ledger";
import { groupOf } from "../src/lib/management-report";

const cash = new Set(["11107"]);
const f = (documentNumber: string, accountCode: string, debit: string, credit: string, extra: Partial<FactLine> = {}): FactLine => ({
  documentNumber, date: "2026-03-05", accountCode, debit, credit, description: "uji", title: "PENGELUARAN KAS", estimate: false, ...extra,
});

test("vouchers keep the accountant's lines, types and cash-flow tags", () => {
  const { vouchers, problems } = planVouchers(
    [
      f("JV-KK-0002", "21101", "100", "0", { cashTag: "INV-ASET" }),
      f("JV-KK-0002", "11107", "0", "100", { cashTag: "INV-ASET" }),
      f("JV-SA-0001", "11107", "500", "0", { date: "2026-01-01", cashTag: "SALDO AWAL" }),
      f("JV-SA-0001", "31101", "0", "500", { date: "2026-01-01" }),
      f("JV-AJ-0003", "51104", "90.50", "0", { estimate: true }),
      f("JV-AJ-0003", "21111", "0", "90.50", { estimate: true }),
      f("JV-UT-0001", "51131", "10", "0"),
      f("JV-UT-0001", "21101", "0", "10"),
      f("JV-PN-0027", "11107", "0", "0"),
    ],
    cash,
  );
  assert.deepEqual(vouchers.map((v) => [v.number, v.type, v.cashActivity ?? "-"]), [
    ["JV-SA-0001", "OPENING", "-"],
    ["JV-AJ-0003", "ADJUSTING", "-"],
    ["JV-KK-0002", "GENERAL", "INVESTING"],
    ["JV-UT-0001", "GENERAL", "-"],
  ]);
  assert.ok(vouchers.find((v) => v.number === "JV-AJ-0003")!.description.includes("ESTIMASI"));
  const suspense = planVouchers([f("JV-UT-0011", "99901", "63000", "0", { estimate: true }), f("JV-UT-0011", "21101", "0", "63000")], cash).vouchers[0];
  assert.ok(suspense.description.includes("PENAMPUNG") && !suspense.description.includes("ESTIMASI"), "suspense lines are not estimates");
  assert.equal(suspense.estimate, false);
  assert.deepEqual(problems, ["JV-PN-0027: tanpa nilai (dilewati)"]);
});

test("unbalanced or multi-date vouchers are reported, not posted silently", () => {
  const { problems } = planVouchers([f("JV-X-1", "11107", "10", "0"), f("JV-X-1", "21101", "0", "9", { date: "2026-03-06" })], cash);
  assert.equal(problems.length, 2);
});

test("cash-flow tags map to ERP activities", () => {
  assert.equal(activityFromTag("OPS-PEMASOK"), "OPERATING");
  assert.equal(activityFromTag("INV-ASET"), "INVESTING");
  assert.equal(activityFromTag("FIN-AFILIASI"), "FINANCING");
  assert.equal(activityFromTag("PNP-PINJAMAN"), "FINANCING");
  assert.equal(activityFromTag("PNP-TIDAKDIKENAL"), "OPERATING");
  assert.equal(activityFromTag("SALDO AWAL"), undefined);
});

test("historical window guards only dates inside the booked range", () => {
  const w = historicalWindow({ historicalLedger: { from: "2026-01-01", through: "2026-10-31", source: "KK" } })!;
  assert.ok(inWindow(w, new Date("2026-10-31T00:00:00Z")));
  assert.ok(!inWindow(w, new Date("2026-11-01T00:00:00Z")));
  assert.equal(historicalWindow({}), null);
  assert.equal(historicalWindow({ historicalLedger: { from: "x", through: "2026-10-31" } }), null);
});

test("management report groups accounts like the working paper", () => {
  const map = new Map([["51101", "HPP"], ["51131", "BEBAN"], ["81101", "LAIN"], ["91101", "PAJAK"]]);
  assert.equal(groupOf("41101", "PENDAPATAN", map), "PENDAPATAN");
  assert.equal(groupOf("51101", "BEBAN", map), "HPP");
  assert.equal(groupOf("51131", "BEBAN", map), "BEBAN");
  assert.equal(groupOf("81101", "BEBAN", map), "LAIN");
  assert.equal(groupOf("91102", "BEBAN", new Map()), "PAJAK");
  assert.equal(groupOf("11107", "ASET", map), null);
});
