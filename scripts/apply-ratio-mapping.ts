// Applies the automatic ratio account mapping (src/lib/ratio-mapping.ts suggestRatioMapping) to a company.
//   npx tsx scripts/apply-ratio-mapping.ts --company KBA [--apply] [--replace]
// Dry-run by default. An existing mapping set by Finance is kept unless --replace is given.
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { ratioMappingFields, suggestRatioMapping } from "../src/lib/ratio-mapping";

const i = process.argv.indexOf("--company"), companyId = i > 0 ? process.argv[i + 1] : undefined;
if (!companyId) throw new Error("Wajib: --company");
const apply = process.argv.includes("--apply"), replace = process.argv.includes("--replace");
const accounts = await db.account.findMany({ select: { id: true, code: true, name: true, category: true, isCash: true, active: true } });
const mapping = suggestRatioMapping(accounts);
const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
const settings = (company.settings ?? {}) as Record<string, unknown>;
const accounting = (settings.accounting ?? {}) as Record<string, unknown>;
const existing = accounting.ratios as Record<string, string[]> | undefined;
const code = (id: string) => accounts.find((a) => a.id === id)?.code ?? id;
const view = Object.fromEntries(ratioMappingFields.map((f) => [f.label, mapping[f.key].map(code).join(", ") || "(kosong)"]));
const hasExisting = existing && Object.values(existing).some((v) => Array.isArray(v) && v.length);
if (!apply || (hasExisting && !replace)) {
  console.log(JSON.stringify({ mode: apply ? "DITAHAN_ADA_PEMETAAN_FINANCE" : "DRY_RUN", company: companyId, usulan: view, existing: hasExisting ? "ada" : "belum ada" }, null, 2));
  process.exit(0);
}
await db.$transaction(async (tx) => {
  await tx.company.update({ where: { id: companyId }, data: { settings: { ...settings, accounting: { ...accounting, ratios: mapping } } as Prisma.InputJsonValue } });
  await tx.auditEvent.create({ data: { companyId, action: "RATIO_MAPPING_AUTO", entityId: companyId, details: { rule: "suggestRatioMapping", mapping, replaced: Boolean(hasExisting) } as Prisma.InputJsonValue } });
});
console.log(JSON.stringify({ mode: "APPLIED", company: companyId, pemetaan: view }, null, 2));
await db.$disconnect();
