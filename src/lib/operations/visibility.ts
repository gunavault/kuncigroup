import type { Prisma, Role } from "@prisma/client";
import {
  AccessError,
  authorizeCompany,
  allowedBranches,
  type Actor,
} from "../auth";

const sourceRoles: Role[] = ["ADMIN", "FINANCE", "MANAGER", "HR", "AUDITOR"];
export function requireSourceAccess(
  actor: Actor,
  companyId: string,
  roles: Role[] = sourceRoles,
) {
  const role = authorizeCompany(actor, companyId, roles);
  if (allowedBranches(actor, companyId).length)
    throw new AccessError(
      "Register impor dan sumber memerlukan cakupan seluruh perusahaan.",
    );
  return role;
}
export function importWhere(
  companyId: string,
  role: Role,
  kind?: string,
): Prisma.ImportRowWhereInput {
  const allowed =
    role === "HR"
      ? { kind: "EMPLOYEE" }
      : ["ADMIN", "MANAGER"].includes(role)
        ? {}
        : { kind: { not: "EMPLOYEE" } };
  return { companyId, AND: [allowed, ...(kind ? [{ kind }] : [])] };
}
export function sourceWhere(
  companyId: string,
  role: Role,
  query = "",
): Prisma.SourceFileWhereInput {
  const sensitive: Prisma.SourceFileWhereInput = {
    OR: [
      "human",
      "hrd",
      "personil",
      "personel",
      "karyawan",
      "medical",
      "mcu",
      "biodata",
      "rekrut",
      "file responses",
      "ktp",
      "gada",
      "sertifik",
    ].map((word) => ({ path: { contains: word, mode: "insensitive" } })),
  };
  return {
    companyId,
    AND: [
      ...(role === "HR"
        ? [sensitive]
        : ["ADMIN", "MANAGER"].includes(role)
          ? []
          : [{ NOT: sensitive }]),
      ...(query
        ? [{ name: { contains: query, mode: "insensitive" as const } }]
        : []),
    ],
  };
}
