import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modulePolicy,
  normalizeApprovalSettings,
  requiredTier,
  meetsTier,
  validTaxId,
} from "../src/lib/operations/approval";
import { groupLines } from "../src/lib/document-pdf";

test("approval tiers follow Manager -> Director -> Administrator limits", () => {
  const p = modulePolicy(
    { approval: { purchase: { managerLimit: "1000", directorLimit: "5000" } } },
    "purchase",
  )!;
  assert.equal(requiredTier(p, 100000n), "MANAGER");
  assert.equal(requiredTier(p, 100001n), "DIRECTOR");
  assert.equal(requiredTier(p, 500000n), "DIRECTOR");
  assert.equal(requiredTier(p, 500001n), "ADMIN");
  const managerOnly = modulePolicy(
    { approval: { payments: { managerLimit: "10" } } },
    "payments",
  )!;
  assert.equal(requiredTier(managerOnly, 2000n), "DIRECTOR");
  assert.equal(
    modulePolicy({ approval: { purchase: {} } }, "purchase"),
    null,
    "empty policy keeps the default single-step flow",
  );
  assert.equal(modulePolicy({ approval: { sales: { managerLimit: "1" } } }, "sales"), null);
  assert.ok(meetsTier("DIRECTOR", false, "DIRECTOR"));
  assert.ok(!meetsTier("MANAGER", false, "DIRECTOR"));
  assert.ok(!meetsTier("FINANCE", false, "MANAGER"));
  assert.ok(meetsTier("STAFF", true, "ADMIN"), "superuser bootstrap");
});

test("approval settings are validated before saving", () => {
  assert.throws(() =>
    normalizeApprovalSettings({ purchase: { managerLimit: "-1" } }),
  );
  assert.throws(() =>
    normalizeApprovalSettings({
      purchase: { managerLimit: "5000", directorLimit: "1000" },
    }),
  );
  assert.throws(() => normalizeApprovalSettings({ unknown: {} }));
  assert.deepEqual(
    normalizeApprovalSettings({
      purchase: { requireOpsVerification: true, managerLimit: " 1000 " },
    }),
    {
      purchase: {
        requireOpsVerification: true,
        managerLimit: "1000",
        directorLimit: "",
      },
    },
  );
});

test("NPWP accepts 15/16 digits or NITKU 22 digits", () => {
  assert.ok(validTaxId("01.234.567.8-901.000"));
  assert.ok(validTaxId("3171234567890001"));
  assert.ok(validTaxId("3171234567890001000000"));
  assert.ok(!validTaxId("12.345"));
  assert.ok(!validTaxId("not applicable"));
});

test("invoice lines are grouped into Management Fee with subtotals", () => {
  const groups = groupLines([
    { description: "Fee", quantity: "1", unitPrice: "50", total: "50.10", group: "Management Fee" },
    { description: "Reimburse", quantity: "1", unitPrice: "100", total: "100.20" },
    { description: "Reimburse 2", quantity: "1", unitPrice: "0.7", total: "0.70" },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.name, g.items.length, g.subtotal]),
    [
      ["Biaya operasional / reimbursable", 2, 10090n],
      ["Management Fee", 1, 5010n],
    ],
  );
});
