// Master-data enrichment v5 (idempotent). Default is a dry run; pass --apply to write.
//   npx tsx scripts/enrich-master-v5.ts [--apply]
// Writes only proven values (see src/lib/master-enrichment.ts) and records an audit event per change.
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { planAssetScopes, planWarehouseCodes } from "../src/lib/master-enrichment";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const companyId = "KBA";
const actorId = "system:enrich-master-v5";
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const assets = (await db.masterRecord.findMany({ where: { companyId, kind: "ASSET" }, select: { id: true, code: true, name: true, data: true } })).map((a) => ({ ...a, data: obj(a.data) }));
const warehouses = (await db.masterRecord.findMany({ where: { companyId, kind: "WAREHOUSE" }, select: { id: true, code: true, name: true, data: true } })).map((w) => ({ ...w, data: obj(w.data) }));
const scopes = planAssetScopes(assets);
const codes = planWarehouseCodes(warehouses);
const hoBranch = await db.branch.findFirst({ where: { companyId, code: "HO" } });
const createHo = codes.missing.some((m) => m.code === "KBAHO") && !warehouses.some((w) => w.code === "KBAHO");

const summary = {
  mode: apply ? "APPLY" : "DRY_RUN",
  assetScope: {
    toSet: scopes.updates.length,
    headOffice: scopes.updates.filter((u) => u.scope === "HEAD_OFFICE").length,
    project: scopes.updates.filter((u) => u.scope === "PROJECT").length,
    unprovable: scopes.unknown,
  },
  warehouseCodes: codes.assign.map((a) => `${warehouses.find((w) => w.id === a.id)?.name} -> ${a.code}`),
  ambiguous: codes.ambiguous,
  notFound: codes.missing.filter((m) => m.code !== "KBAHO"),
  createKbaho: createHo && Boolean(hoBranch),
};

if (apply) {
  await db.$transaction(async (tx) => {
    const audit = (entityId: string, action: string, details: Prisma.InputJsonValue) =>
      tx.auditEvent.create({ data: { companyId, actorId, action, entityId, details } });
    for (const u of scopes.updates) {
      const a = assets.find((x) => x.id === u.id)!;
      await tx.masterRecord.update({ where: { id: u.id }, data: { data: { ...a.data, assetScope: u.scope, assetScopeSource: `lineage:${u.file}` } as Prisma.InputJsonValue } });
      await audit(u.id, "MASTER_ENRICHED", { field: "assetScope", value: u.scope, source: u.file });
    }
    for (const c of codes.assign) {
      const w = warehouses.find((x) => x.id === c.id)!;
      await tx.masterRecord.update({ where: { id: c.id }, data: { data: { ...w.data, odooCode: c.code, odooCodeSource: "Manual Guide ABJ-SOP-001.24.06.26 hlm. 29" } as Prisma.InputJsonValue } });
      await audit(c.id, "MASTER_ENRICHED", { field: "odooCode", value: c.code });
    }
    if (summary.createKbaho && hoBranch) {
      const created = await tx.masterRecord.create({ data: { companyId, branchId: hoBranch.id, kind: "WAREHOUSE", code: "KBAHO", name: "Gudang Kantor Pusat KBA",
        data: { type: "CENTRAL", odooCode: "KBAHO", sourceVerification: "PENDING", sourceReferences: [{ file: "Manual Guide - Kunci (ABJ-SOP-001.24.06.26)", page: 29, note: "Gudang PT Kunci Berkah Abadi - HO, lokasi KBAHO/Stock di Odoo" }] } } });
      await audit(created.id, "MASTER_CREATED", { kind: "WAREHOUSE", code: "KBAHO", source: "Manual Guide hlm. 29", verification: "PENDING" });
    }
  }, { timeout: 120000 });
}
console.log(JSON.stringify(summary, null, 2));
await db.$disconnect();
