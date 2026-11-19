import { test } from "node:test";
import assert from "node:assert/strict";
import { planAssetScopes, planWarehouseCodes } from "../src/lib/master-enrichment";
import { validateMaster } from "../src/lib/operations/validation";

const row = (id: string, name: string, data: Record<string, unknown> = {}) => ({ id, code: id, name, data });

test("asset scope comes only from proven source lineage", () => {
  const plan = planAssetScopes([
    row("a1", "Kursi", { sourceReferences: [{ file: "upload-c9b709319fd67744bfe5b4e5", row: 3 }] }),
    row("a2", "Polisher", { sourceReferences: [{ file: "upload-c25e09142c3b0dc361f2a743", row: 9 }] }),
    row("a3", "Tanpa sumber", {}),
    row("a4", "Sudah diisi", { assetScope: "PROJECT", sourceReferences: [{ file: "upload-c9b709319fd67744bfe5b4e5" }] }),
    row("a5", "Dua sumber", { sourceReferences: [{ file: "upload-c9b709319fd67744bfe5b4e5" }, { file: "upload-c25e09142c3b0dc361f2a743" }] }),
  ]);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.scope]), [["a1", "HEAD_OFFICE"], ["a2", "PROJECT"]]);
  assert.equal(plan.unknown, 2, "no source and conflicting sources are not guessed");
});

test("warehouse codes are assigned only on a unique match", () => {
  const plan = planWarehouseCodes([
    row("w1", "Gudang KLH Plaza Kuningan"),
    row("w2", "Gudang Halim / Pandawa"),
    row("w3", "Lokasi HALIM - PANDAWA"),
    row("w4", "Gudang KLH Bonas", { odooCode: "KLHB" }),
  ]);
  assert.deepEqual(plan.assign, [{ id: "w1", code: "KLHP" }]);
  assert.equal(plan.ambiguous.find((a) => a.code === "KBAHP")?.candidates.length, 2);
  assert.ok(!plan.missing.some((m) => m.code === "KLHB"), "already coded");
  assert.ok(plan.missing.some((m) => m.code === "KBAHO"));
});

test("employee contract and PKP partner rules", () => {
  assert.throws(() => validateMaster("EMPLOYEE", { position: "Teknisi", employmentStatus: "PKWT" }), /PKWT/);
  assert.throws(() => validateMaster("EMPLOYEE", { position: "Teknisi", employmentStatus: "PKWT", contractStart: "2020-01-01", contractEnd: "2026-01-01" }), /5 tahun/);
  assert.throws(() => validateMaster("EMPLOYEE", { position: "Teknisi", contractStart: "2026-02-01", contractEnd: "2026-01-01" }), /mendahului/);
  validateMaster("EMPLOYEE", { position: "Teknisi", employmentStatus: "PKWT", contractStart: "2026-01-01", contractEnd: "2027-12-31" });
  validateMaster("EMPLOYEE", { position: "Teknisi", employmentStatus: "PKWTT" });
  assert.throws(() => validateMaster("PARTNER", { type: "VENDOR", pkp: true }), /PKP/);
  assert.throws(() => validateMaster("ASSET", { fiscalGroup: "KELOMPOK_9" }));
  validateMaster("ASSET", { fiscalGroup: "KELOMPOK_2", assetScope: "PROJECT" });
});
