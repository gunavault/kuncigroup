import { z } from "zod";
import { authorizeCompany, allowedBranches, AccessError, type Actor } from "./auth";
import { atomic, object, json } from "./operations/shared";
import { cents, signedCents } from "./money";
export const servicePlanKey = (period: string) => `_service_plan:${period}`;
import { calkSections } from "./service-plans-ui";
export { calkSections, emptyServicePlan } from "./service-plans-ui";
const money = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Nilai uang wajib angka positif, maksimum dua desimal.").refine(v => cents(v) > 0n, "Nilai harus lebih besar dari nol.");
const reference = z.string().trim().min(10).max(1000);
const planSchema = z.strictObject({
  companyId: z.string().min(1), periodId: z.string().min(1), version: z.number().int().nonnegative(),
  framework: z.enum(["UNCONFIRMED", "SAK_EP", "SAK_EMKM", "SAK_INDONESIA"]), frameworkEvidence: z.string().trim().max(2000),
  notes: z.record(z.enum(calkSections.map(s => s[0])), z.string().trim().max(10000)),
  budgets: z.array(z.strictObject({ projectId: z.string().min(1), category: z.enum(["CHEMICAL", "LABOR"]), amount: money, evidence: reference })).max(200),
  cashPlans: z.array(z.strictObject({ date: z.iso.date(), direction: z.enum(["IN", "OUT"]), category: z.enum(["COLLECTION", "PAYROLL", "BPJS", "TAX", "CHEMICAL", "OTHER"]), projectId: z.string(), amount: money, evidence: reference })).max(300),
  allocations: z.array(z.strictObject({ lineId: z.string().min(1), projectId: z.string().min(1), amount: money, evidence: z.string().trim().min(20).max(1000) })).max(1000),
}).refine(d => d.framework === "UNCONFIRMED" || d.frameworkEvidence.length >= 20, "Pemilihan kerangka pelaporan memerlukan dasar keputusan minimal 20 karakter.");
export type ServicePlanInput = z.infer<typeof planSchema>;
export async function saveServicePlan(actor: Actor, input: unknown) {
  const d = planSchema.parse(input), companyId = d.companyId;
  authorizeCompany(actor, companyId, ["ADMIN", "FINANCE"]);
  if (allowedBranches(actor, companyId).length) throw new AccessError("Catatan dan rencana perusahaan memerlukan seluruh cabang.");
  return atomic(companyId, async tx => {
    await tx.$queryRaw`SELECT id FROM fiscal_periods WHERE id=${d.periodId} AND company_id=${companyId} FOR UPDATE`;
    const period = await tx.fiscalPeriod.findFirstOrThrow({ where: { id: d.periodId, companyId } });
    if (period.status !== "OPEN") throw new Error("Catatan/rencana periode yang sudah ditutup terkunci.");
    if (d.cashPlans.some(p => new Date(p.date + "T00:00:00Z") <= period.endDate)) throw new Error("Tanggal rencana kas harus setelah tanggal kas dasar pada akhir periode.");
    const key = servicePlanKey(period.id), previous = await tx.moduleSetting.findUnique({ where: { companyId_key: { companyId, key } } });
    if (Number(object(previous?.settings).version ?? 0) !== d.version) throw new Error("Rencana berubah sejak dibuka. Muat ulang sebelum menyimpan.");
    const projects = [...new Set([...d.budgets, ...d.cashPlans, ...d.allocations].map(b => b.projectId).filter(Boolean))];
    if (await tx.masterRecord.count({ where: { companyId, kind: "PROJECT", id: { in: projects } } }) !== projects.length) throw new Error("Proyek rencana harus berasal dari perusahaan yang sama.");
    const seen = new Set<string>();
    for (const row of d.budgets) { const id = `${row.projectId}:${row.category}`; if (seen.has(id)) throw new Error("Satu proyek/kategori hanya memiliki satu anggaran pada periode ini."); seen.add(id); }
    const lineIds = [...new Set(d.allocations.map(a => a.lineId))];
    const lines = await tx.journalLine.findMany({ where: { id: { in: lineIds }, entry: { companyId, fiscalPeriodId: period.id, status: "POSTED", type: { not: "CLOSING" } }, account: { category: { in: ["PENDAPATAN", "BEBAN"] } } }, select: { id: true, debit: true, credit: true } });
    if (lines.length !== lineIds.length) throw new Error("Alokasi hanya untuk baris pendapatan/beban POSTED pada perusahaan dan periode terpilih.");
    for (const line of lines) { const value = signedCents(line.debit) - signedCents(line.credit), total = d.allocations.filter(a => a.lineId === line.id).reduce((s, a) => s + cents(a.amount), 0n); if (total > (value < 0n ? -value : value)) throw new Error("Jumlah alokasi melebihi nilai baris jurnal. Sisa yang belum dibagi tetap belum dialokasikan."); }
    const { companyId: ignoredCompany, periodId: ignoredPeriod, ...values } = d;
    void ignoredCompany; void ignoredPeriod;
    const saved = { ...values, version: d.version + 1, updatedBy: actor.id, updatedName: actor.name, updatedAt: new Date().toISOString(), basis: "Rencana/catatan dengan rujukan sumber; tidak memposting jurnal atau menyatakan laporan final." };
    await tx.moduleSetting.upsert({ where: { companyId_key: { companyId, key } }, create: { companyId, key, settings: json(saved) }, update: { settings: json(saved) } });
    await tx.auditEvent.create({ data: { companyId, actorId: actor.id, action: "SERVICE_PLAN_SAVED", entityId: period.id, details: { version: saved.version, framework: saved.framework, budgets: saved.budgets.length, cashPlans: saved.cashPlans.length, allocations: saved.allocations.length } } });
    return { version: saved.version };
  });
}
