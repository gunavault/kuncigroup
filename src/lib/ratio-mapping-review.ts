import { createHash } from "node:crypto";
import { authorizeCompany, allowedBranches, AccessError, type Actor } from "./auth";
import { atomic, object, json, str } from "./operations/shared";
import { validateRatioMapping } from "./ratio-mapping";
export function ratioMappingHash(mapping: unknown) { return createHash("sha256").update(JSON.stringify(Object.entries(object(mapping)).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, Array.isArray(values) ? [...values].sort() : values]))).digest("hex"); }
export async function saveRatioMapping(actor: Actor, input: unknown) {
  const d = object(input), companyId = str(d.companyId), note = str(d.note).trim();
  authorizeCompany(actor, companyId, ["ADMIN", "FINANCE"]);
  if (allowedBranches(actor, companyId).length) throw new AccessError("Pemetaan memerlukan akses seluruh perusahaan.");
  if (d.confirmed !== true || note.length < 20 || note.length > 2000) throw new Error("Konfirmasi tinjauan klasifikasi dan catatan bukti 20–2.000 karakter wajib diisi.");
  return atomic(companyId, async tx => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } }), settings = object(company.settings), accounting = object(settings.accounting);
    const mapping = validateRatioMapping(d.mapping, await tx.account.findMany({ select: { id: true, category: true } }));
    const review = { status: "VERIFIED", by: actor.id, name: actor.name, at: new Date().toISOString(), note, hash: ratioMappingHash(mapping) };
    await tx.company.update({ where: { id: companyId }, data: { settings: json({ ...settings, accounting: { ...accounting, ratios: mapping, ratioMappingReview: review } }) } });
    await tx.auditEvent.create({ data: { companyId, actorId: actor.id, action: "RATIO_MAPPING_REVIEWED", entityId: companyId, details: json({ note, hash: review.hash }) } });
    return { reviewed: true };
  });
}
