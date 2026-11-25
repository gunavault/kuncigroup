import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceRevisionRows, sourceMoney } from "../src/lib/invoice-revision";
import { validateRatioMapping } from "../src/lib/ratio-mapping";
const header = ["No", "Periode", "Sister Company", "No. Invoice", "Tgl. Invoice", "Nama Client", "Pekerjaan", "Nilai", "PPN 11%", "PPH 23 2%", "Total", "Tgl. Pembayaran", "Bank Pembayaran", "Status"];
const data = [1, "Januari", "PT Kunci Berkah Abadi", "KBA/INV/001/2026", "2026-01-10T00:00:00.000Z", "Pelanggan uji", "Jasa", 100, 11, 2, 109, null, "Rekening privat jangan disalin", "OPEN"];
const rows = (row: (string | number | null)[]) => [[], [], header, row];
test("invoice revisions stage changed business cells and exclude account columns and bank-only changes", () => {
  const bankOnly = [...data]; bankOnly[12] = "Bank lain";
  assert.equal(invoiceRevisionRows(rows(bankOnly), rows(data)).rows.length, 0);
  const corrected = [...data]; corrected[10] = 108.50;
  const result = invoiceRevisionRows(rows(corrected), rows(data));
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].companyId, "KBA"); assert.equal(result.rows[0].amount, "108.50"); assert.equal(result.rows[0].data.cells["13"], undefined);
  assert.equal(result.rows[0].data.sourceVerification, "UNVERIFIED");
  assert.deepEqual(result.rows[0].data.changedColumns, ["Total"]);
});
test("ambiguous issuers, invalid dates, formula errors and complimentary amounts stay unresolved", () => {
  const uncertain = [...data]; uncertain[2] = "PT Kunci Cipta Gemilang"; uncertain[4] = "2026-02-31"; uncertain[10] = "#N/A";
  const result = invoiceRevisionRows(rows(uncertain), rows(data)).rows[0];
  assert.equal(result.companyId, null); assert.equal(result.effectiveDate, null); assert.equal(result.amount, null); assert.equal(result.data.cells["11"], "#N/A");
  assert.equal(sourceMoney("Compliment"), null); assert.equal(sourceMoney(null), null); assert.equal(sourceMoney("0"), "0.00"); assert.equal(sourceMoney("123456789.995"), "123456790.00");
  assert.throws(() => invoiceRevisionRows([[], [], ["wrong"]], []));
});
test("ratio mappings reject duplicate/wrong-category accounts and quick assets outside current assets", () => {
  const accounts = [{ id: "cash", category: "ASET" }, { id: "loan", category: "KEWAJIBAN" }];
  assert.throws(() => validateRatioMapping({ currentAssetIds: ["loan"] }, accounts));
  assert.throws(() => validateRatioMapping({ currentAssetIds: ["cash", "cash"] }, accounts));
  assert.throws(() => validateRatioMapping({ quickAssetIds: ["cash"] }, accounts));
  assert.deepEqual(validateRatioMapping({ currentAssetIds: ["cash"], quickAssetIds: ["cash"] }, accounts).quickAssetIds, ["cash"]);
});
