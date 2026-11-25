import type { Role } from "@prisma/client";
import { cents } from "../money";
import { object, str, quantity, qty, type Tx } from "./shared";

/**
 * Approval policy per company, set by the owner in Settings ->
 * company.settings.approval[module]. These controls are modelled on the Odoo
 * handover (abj_purchase): an OPS verification step before approval, and
 * amount tiers Manager -> Director -> Administrator/BOD.
 * No policy means the default flow (approver other than the maker).
 */
export const policyModules = [
  "purchase",
  "payments",
  "cash-advance",
  "expenses",
] as const;
export type ApprovalTier = "MANAGER" | "DIRECTOR" | "ADMIN";
export type ModulePolicy = {
  requireOpsVerification: boolean;
  managerLimit: bigint | null;
  directorLimit: bigint | null;
};
/** Document fields only the workflow may write; stripped whenever a draft is saved. */
export const workflowKeys = [
  "opsVerifiedBy",
  "opsVerifiedName",
  "opsVerifiedAt",
  "approvalTier",
  "approvedName",
  "quotaOverride",
] as const;
export const tierLabel: Record<ApprovalTier, string> = {
  MANAGER: "Manager",
  DIRECTOR: "Direktur",
  ADMIN: "Administrator/BOD",
};
export const opsVerifierRoles: Role[] = [
  "ADMIN",
  "DIRECTOR",
  "MANAGER",
  "SUPERVISOR",
];
const tierRank: Record<ApprovalTier, number> = {
  MANAGER: 60,
  DIRECTOR: 80,
  ADMIN: 100,
};
const roleRank: Partial<Record<Role, number>> = {
  ADMIN: 100,
  DIRECTOR: 80,
  MANAGER: 60,
};

function limit(v: unknown, label: string) {
  const s = str(v).trim();
  if (!s) return null;
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s))
    throw new Error(`${label} harus angka positif (maksimal 2 desimal).`);
  return cents(s);
}

function parse(raw: unknown, module: string): ModulePolicy {
  const p = object(raw);
  const policy = {
    requireOpsVerification: p.requireOpsVerification === true,
    managerLimit: limit(p.managerLimit, `Batas Manager ${module}`),
    directorLimit: limit(p.directorLimit, `Batas Direktur ${module}`),
  };
  if (
    policy.managerLimit !== null &&
    policy.directorLimit !== null &&
    policy.directorLimit < policy.managerLimit
  )
    throw new Error(
      `Batas Direktur ${module} tidak boleh lebih kecil dari batas Manager.`,
    );
  return policy;
}

export function modulePolicy(
  companySettings: unknown,
  module: string,
): ModulePolicy | null {
  if (!(policyModules as readonly string[]).includes(module)) return null;
  const policy = parse(
    object(object(companySettings).approval)[module],
    module,
  );
  if (
    !policy.requireOpsVerification &&
    policy.managerLimit === null &&
    policy.directorLimit === null
  )
    return null;
  return policy;
}

/** Validates and normalises settings.approval before it is saved. */
export function normalizeApprovalSettings(value: unknown) {
  const input = object(value),
    out: Record<string, unknown> = {};
  for (const key of Object.keys(input))
    if (!(policyModules as readonly string[]).includes(key))
      throw new Error(`Kebijakan persetujuan untuk modul ${key} tidak dikenal.`);
  for (const module of policyModules) {
    if (input[module] === undefined) continue;
    const p = parse(input[module], module),
      raw = object(input[module]);
    out[module] = {
      requireOpsVerification: p.requireOpsVerification,
      managerLimit: p.managerLimit === null ? "" : str(raw.managerLimit).trim(),
      directorLimit:
        p.directorLimit === null ? "" : str(raw.directorLimit).trim(),
    };
  }
  return out;
}

/** The lowest approver level allowed for a given document value. */
export function requiredTier(
  p: ModulePolicy,
  total: bigint,
): ApprovalTier | null {
  if (p.managerLimit === null && p.directorLimit === null) return null;
  if (p.managerLimit !== null && total <= p.managerLimit) return "MANAGER";
  if (p.directorLimit === null) return "DIRECTOR";
  if (total <= p.directorLimit) return "DIRECTOR";
  return "ADMIN";
}

export function meetsTier(
  assigned: Role,
  superuser: boolean,
  tier: ApprovalTier,
) {
  return superuser || (roleRank[assigned] ?? 0) >= tierRank[tier];
}

/**
 * NPWP 15 digits (legacy format), NPWP 16 digits (NIK/PMK 112/2022) or
 * NITKU 22 digits. Dots, dashes and spaces are ignored.
 */
export function validTaxId(value: unknown) {
  const digits = str(value).replace(/[.\-\s]/g, "");
  return /^(\d{15}|\d{16}|\d{22})$/.test(digits);
}

/**
 * Project purchase quota (equivalent of purchase.qty.limit). Counts approved
 * or posted Purchase Orders (documentType ORDER) for the same project and
 * product within the quota period. Bills are not counted, so a PO followed
 * by its bill is not counted twice.
 */
export async function purchaseQuotaBreaches(
  tx: Tx,
  record: {
    id: string;
    companyId: string;
    date: Date;
    data: unknown;
    lines: { productId: string | null; quantity: unknown }[];
  },
) {
  const d = object(record.data);
  if (str(d.documentType) !== "ORDER" || !str(d.projectId)) return [];
  const projectId = str(d.projectId),
    day = record.date.toISOString().slice(0, 10);
  const quotas = (
    await tx.masterRecord.findMany({
      where: {
        companyId: record.companyId,
        kind: "PURCHASE_QUOTA",
        active: true,
        data: { path: ["projectId"], equals: projectId },
      },
    })
  ).filter((q) => {
    const qd = object(q.data);
    return (
      (!str(qd.startDate) || str(qd.startDate) <= day) &&
      (!str(qd.endDate) || str(qd.endDate) >= day)
    );
  });
  const breaches: string[] = [];
  const requested = new Map<string, bigint>();
  for (const l of record.lines)
    if (l.productId)
      requested.set(
        l.productId,
        (requested.get(l.productId) ?? 0n) + quantity(str(l.quantity)),
      );
  for (const [productId, want] of requested) {
    for (const q of quotas.filter(
      (q) => str(object(q.data).productId) === productId,
    )) {
      const qd = object(q.data),
        max = quantity(str(qd.maxQuantity));
      const used = await tx.businessLine.findMany({
        where: {
          productId,
          record: {
            companyId: record.companyId,
            module: "purchase",
            id: { not: record.id },
            status: { in: ["APPROVED", "POSTED"] },
            AND: [
              { data: { path: ["projectId"], equals: projectId } },
              { data: { path: ["documentType"], equals: "ORDER" } },
            ],
            ...(str(qd.startDate) || str(qd.endDate)
              ? {
                  date: {
                    ...(str(qd.startDate)
                      ? { gte: new Date(str(qd.startDate)) }
                      : {}),
                    ...(str(qd.endDate)
                      ? { lte: new Date(str(qd.endDate)) }
                      : {}),
                  },
                }
              : {}),
          },
        },
        select: { quantity: true },
      });
      const consumed = used.reduce(
        (s, l) => s + quantity(l.quantity.toString()),
        0n,
      );
      if (consumed + want > max)
        breaches.push(
          `${q.name}: sisa kuota ${qty(max - consumed < 0n ? 0n : max - consumed)}, diminta ${qty(want)}`,
        );
    }
  }
  return breaches;
}
