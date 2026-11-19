import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
const schema = `mini_${randomUUID().replaceAll("-", "")}`, url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema); process.env.DATABASE_URL = url.toString();
const client = new pg.Client({ connectionString: url.toString() });
await client.connect(); await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
for (const d of readdirSync("prisma/migrations").filter(d => /^\d/.test(d)).sort()) await client.query(readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8"));
const { db } = await import("../src/lib/db");
const { moduleMiniDashboard } = await import("../src/lib/operations/mini-dashboard");
const { operationSnapshot } = await import("../src/lib/operations/read");
const { modules } = await import("../src/lib/operations/registry");
type Actor = import("../src/lib/auth").Actor;
const admin: Actor = { id: "admin", name: "Admin", email: "admin@example.test", superuser: true, grants: [], mustChangePassword: false };
const actor = (role: import("@prisma/client").Role, branches: string[] = []): Actor => ({ ...admin, id: "self", superuser: false, grants: [{ companyId: "A", role, branchIds: branches }] });
const value = (r: Awaited<ReturnType<typeof moduleMiniDashboard>>, key: string) => r.cards.find(c => c.key === key)?.value;
await db.company.createMany({ data: [{ id: "A", code: "A", name: "Company A" }, { id: "B", code: "B", name: "Company B" }] });
await db.branch.createMany({ data: [{ id: "A1", companyId: "A", code: "1", name: "Branch 1" }, { id: "A2", companyId: "A", code: "2", name: "Branch 2" }] });
await db.businessRecord.createMany({ data: Array.from({ length: 62 }, (_, i) => ({ companyId: i === 61 ? "B" : "A", branchId: i === 60 ? "A2" : i === 61 ? null : "A1", module: "sales", number: `SALE-${i}`, title: i === 0 ? "Search unique" : "Ordinary sale", date: new Date("2026-11-19"), actorId: i < 2 ? "self" : "other" })) });

test("all 19 modules return 4–6 cards; unknown module is rejected", async () => {
  assert.equal(modules.length, 19);
  for (const module of modules) { const r = await moduleMiniDashboard(admin, "A", module.key); assert.ok(r.cards.length >= 4 && r.cards.length <= 6, module.key); assert.equal(new Set(r.cards.map(c => c.key)).size, r.cards.length); }
  await assert.rejects(moduleMiniDashboard(admin, "A", "unknown"));
});
test("aggregates include every page and enforce company, branch, ownership and search", async () => {
  assert.equal(value(await moduleMiniDashboard(admin, "A", "sales"), "total"), "61");
  assert.equal(value(await moduleMiniDashboard(actor("MANAGER", ["A1"]), "A", "sales"), "total"), "60");
  assert.equal(value(await moduleMiniDashboard(actor("EMPLOYEE", ["A1"]), "A", "sales"), "total"), "2");
  assert.equal(value(await moduleMiniDashboard(admin, "A", "sales", { query: "unique" }), "total"), "1");
  await assert.rejects(moduleMiniDashboard(actor("MANAGER", ["A1"]), "A", "sales", { branchId: "A2" }));
  await assert.rejects(moduleMiniDashboard(actor("MANAGER"), "B", "sales"));
  await assert.rejects(moduleMiniDashboard(actor("HR"), "A", "sales"));
  assert.equal(value(await moduleMiniDashboard(actor("STAFF"), "A", "sales"), "outstanding"), null);
});
test("selected branch retains shared catalogs while hiding other branches and employee masters", async () => {
  await db.masterRecord.createMany({ data: [
    { id: "shared", companyId: "A", kind: "PRODUCT", code: "P", name: "Shared product" },
    { id: "private", companyId: "A", branchId: "A2", kind: "PRODUCT", code: "P2", name: "Branch product" },
    { id: "employee", companyId: "A", kind: "EMPLOYEE", code: "E", name: "Private employee" },
    { id: "warehouse", companyId: "A", branchId: "A2", kind: "WAREHOUSE", code: "W", name: "Warehouse two" },
  ] });
  for (const who of [actor("MANAGER", ["A1"]), actor("STAFF")]) {
    const r = await operationSnapshot(who, "A", { branchId: "A1" });
    assert.ok(r.masters.some(m => m.id === "shared"));
    assert.ok(!r.masters.some(m => ["private", "employee", "warehouse"].includes(m.id)));
  }
});
test("catalog migration preserves physical scope, reviewed catalogs and original source location; replay is safe", async () => {
  await db.masterRecord.createMany({ data: [
    { id: "imported", companyId: "A", branchId: "A1", kind: "PRODUCT", code: "IMP", name: "Imported", data: { importBatch: "test" } },
    { id: "reviewed", companyId: "A", branchId: "A1", kind: "PARTNER", code: "REV", name: "Reviewed", data: { importBatch: "test", sourceVerification: "VERIFIED" } },
    { id: "asset", companyId: "A", branchId: "A1", kind: "ASSET", code: "AST", name: "Asset", data: { importBatch: "test" } },
  ] });
  const sql = readFileSync("prisma/migrations/202611190001_company_catalog_scope/migration.sql", "utf8");
  await client.query(sql); await client.query(sql);
  const imported = await db.masterRecord.findUniqueOrThrow({ where: { id: "imported" } });
  assert.equal(imported.branchId, null); assert.equal((imported.data as Record<string, unknown>).sourceLocation, "Branch 1");
  for (const id of ["reviewed", "asset"]) assert.equal((await db.masterRecord.findUniqueOrThrow({ where: { id } })).branchId, "A1");
});
test("money cards exclude unposted imports and orders without journals, retain cents and closing neutrality", async () => {
  const cash = await db.account.create({ data: { code: "100", name: "Cash", category: "ASET", normalBalance: "DEBIT" } });
  const revenue = await db.account.create({ data: { code: "400", name: "Revenue", category: "PENDAPATAN", normalBalance: "KREDIT" } });
  const period = await db.fiscalPeriod.create({ data: { companyId: "A", name: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  async function journal(number: string, type: "GENERAL" | "CLOSING", reverse = false) {
    const j = await db.journalEntry.create({ data: { companyId: "A", branchId: "A1", journalNumber: number, transactionDate: new Date("2026-11-19"), fiscalPeriodId: period.id, type, description: "Test", lines: { create: [{ accountId: cash.id, debit: reverse ? "0" : "99.99", credit: reverse ? "99.99" : "0" }, { accountId: revenue.id, debit: reverse ? "99.99" : "0", credit: reverse ? "0" : "99.99" }] } } });
    return db.journalEntry.update({ where: { id: j.id }, data: { status: "POSTED" } });
  }
  const j = await journal("J1", "GENERAL"); await journal("J2", "CLOSING", true);
  await db.businessRecord.createMany({ data: [
    { companyId: "A", branchId: "A1", module: "sales", number: "POSTED-INVOICE", title: "Invoice", date: new Date("2026-11-19"), actorId: "self", status: "POSTED", amount: "99.99", settled: "0.01", journalId: j.id },
    { companyId: "A", branchId: "A1", module: "sales", number: "POSTED-ORDER", title: "Order", date: new Date("2026-11-19"), actorId: "self", status: "POSTED", amount: "999999.99", data: { documentType: "ORDER" } },
    { companyId: "A", branchId: "A1", module: "sales", number: "IMPORTED", title: "Source", date: new Date("2026-11-19"), actorId: "self", status: "IMPORTED", amount: "123456.78" },
  ] });
  assert.equal(value(await moduleMiniDashboard(admin, "A", "sales"), "outstanding"), "99.98");
  const dash = await moduleMiniDashboard(admin, "A", "dashboards", { periodId: period.id });
  assert.equal(value(dash, "revenue"), "99.99"); assert.equal(value(dash, "profit"), "99.99"); assert.equal(value(dash, "balance"), "0.00");
  const acct = await moduleMiniDashboard(admin, "A", "accounting", { branchId: "A2" }); assert.equal(value(acct, "debit"), "0.00");
  const other = await db.fiscalPeriod.create({ data: { companyId: "B", name: "Other", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
  await assert.rejects(moduleMiniDashboard(admin, "A", "accounting", { periodId: other.id }));
});
test("settings counts the global owner while excluding users of another company and respecting branch filters", async () => {
  const owner = await db.user.create({ data: { username: "owner-mini", name: "Global owner", passwordHash: "unused-test-fixture", isSuperuser: true } });
  await db.user.create({ data: { username: "other-mini", name: "Other company", passwordHash: "unused-test-fixture", grants: { create: { companyId: "B", role: "STAFF" } } } });
  const company = await moduleMiniDashboard(admin, "A", "settings");
  assert.equal(value(company, "users"), "1"); assert.equal(value(company, "active"), "1"); assert.equal(value(company, "inactive"), "0");
  assert.equal(value(await moduleMiniDashboard(admin, "A", "settings", { branchId: "A1" }), "users"), "0");
  await db.user.update({ where: { id: owner.id }, data: { active: false } });
  assert.equal(value(await moduleMiniDashboard(admin, "A", "settings"), "inactive"), "1");
});
after(async () => { await db.$disconnect(); await client.query(`DROP SCHEMA "${schema}" CASCADE`); await client.end(); });
