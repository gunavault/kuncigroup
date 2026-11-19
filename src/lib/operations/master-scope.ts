import type { Prisma } from "@prisma/client";

/** A null branch denotes an explicitly shared company catalog, never an employee roster. */
export const companyCatalogKinds = ["PRODUCT", "PARTNER", "BOM", "DEPARTMENT", "POSITION", "ASSET_CLASS"];
export function masterBranchScope(branches: string[], selected?: string): Prisma.MasterRecordWhereInput {
  const ids = selected ? [selected] : branches;
  return ids.length ? { OR: [
    { branchId: { in: ids } },
    { branchId: null, kind: { in: companyCatalogKinds } },
  ] } : {};
}
