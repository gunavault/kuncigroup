import { operationalInsights } from "./insights";
import { sourceWhere, importWhere } from "./visibility";
import { db } from "../db";
import { authorizeCompany, allowedBranches, type Actor } from "../auth";
import { object, str } from "./shared";
import { modules, definitions, masterDefinitions } from "./registry";
import {userDirectory} from './users';
import {assignedRole} from '../auth';
import { masterBranchScope } from './master-scope';
export async function operationSnapshot(
  actor: Actor,
  companyId: string,
  options: {
    module?: string;
    kind?: string;
    branchId?: string;
    page?: number;
    query?: string;
  } = {},
) {
  const role = authorizeCompany(actor, companyId);
  const branches = allowedBranches(actor, companyId);
  const branchFilter = options.branchId
    ? { branchId: options.branchId }
    : branches.length
      ? { branchId: { in: branches } }
      : {};
  if (options.branchId)
    authorizeCompany(actor, companyId, undefined, options.branchId);
  const companies = await db.company.findMany({
    where: actor.superuser
      ? {}
      : { id: { in: actor.grants.map((g) => g.companyId) } },
    orderBy: { code: "asc" },
  });
  const company = companies.find((c) => c.id === companyId);
  if (!company) throw new Error("Perusahaan tidak tersedia.");
  const allowedMasterKinds =
    role === "STAFF"
      ? ["PARTNER", "PRODUCT", "WAREHOUSE", "PROJECT", "BOM", "ASSET"]
      : Object.keys(masterDefinitions);
  let masterWhere = {
    companyId,
    kind: { in: allowedMasterKinds },
    ...masterBranchScope(branches, options.branchId),
  } as import("@prisma/client").Prisma.MasterRecordWhereInput;
  // Company-wide masters are available in restricted branches; sensitive employees remain scoped.
  if (branches.length && !options.branchId)
    masterWhere = {
      companyId,
      kind: { in: allowedMasterKinds },
      ...masterBranchScope(branches, options.branchId),
    };
  if (options.kind)
    masterWhere.kind = allowedMasterKinds.includes(options.kind)
      ? options.kind
      : "FORBIDDEN";
  if (role === "STAFF" && options.kind === "EMPLOYEE")
    masterWhere = {
      companyId,
      kind: "EMPLOYEE",
      data: { path: ["userId"], equals: actor.id },
      ...branchFilter,
    };
  if (role === "STAFF" && !options.kind)
    masterWhere = {
      companyId,
      OR: [
        {
          kind: { in: allowedMasterKinds },
          ...masterBranchScope(branches, options.branchId),
        },
        {
          kind: "EMPLOYEE",
          data: { path: ["userId"], equals: actor.id },
          ...branchFilter,
        },
      ],
    };
  const visibility =
    role === "STAFF"
      ? { actorId: actor.id }
      : role === "HR"
        ? {
            module: {
              in: ["attendances", "timesheets", "shifts", "project", "quality"],
            },
          }
        : {};
  const sourceAccess =
    ["ADMIN", "FINANCE", "HR", "MANAGER", "AUDITOR"].includes(role) &&
    !branches.length;
  const recordWhere: import("@prisma/client").Prisma.BusinessRecordWhereInput =
    {
      companyId,
      ...branchFilter,
      ...(options.module ? { module: options.module } : {}),
      ...visibility,
      ...(options.query
        ? {
            OR: [
              { number: { contains: options.query, mode: "insensitive" } },
              { title: { contains: options.query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  const page = Math.max(0, options.page ?? 0),
    take = 50;
  const [
    masters,
    records,
    total,
    branchList,
    settings,
    stock,
    messages,
    stats,
    imports,
    sourceCount,
    users,
    financialStats,
  ] = await Promise.all([
    db.masterRecord.findMany({
      where: masterWhere,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      take: 5000,
    }),
    db.businessRecord.findMany({
      where: recordWhere,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: page * take,
      take,
      include: { lines: true },
    }),
    db.businessRecord.count({ where: recordWhere }),
    db.branch.findMany({
      where: {
        companyId,
        ...(branches.length ? { id: { in: branches } } : {}),
      },
      orderBy: { name: "asc" },
    }),
    db.moduleSetting.findMany({ where: { companyId } }),
    db.stockLot.findMany({
      where: { companyId, ...branchFilter },
      orderBy: [{ productId: "asc" }, { expiresAt: "asc" }],
      take: 1000,
    }),
    db.discussion.findMany({
      where: { companyId, ...branchFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.businessRecord.groupBy({
      by: ["module", "status"],
      where: { companyId, ...branchFilter, ...visibility },
      _count: true,
      _sum: { amount: true, settled: true },
    }),
    sourceAccess
      ? db.importRow.groupBy({
          by: ["kind", "status"],
          where: importWhere(companyId, role),
          _count: true,
        })
      : Promise.resolve([]),
    sourceAccess
      ? db.sourceFile.count({ where: sourceWhere(companyId, role) })
      : Promise.resolve(0),
    ["ADMIN","MANAGER","HR"].includes(role)
      ? userDirectory(actor,companyId).then(d=>d.users)
      : Promise.resolve([]),
    db.businessRecord.groupBy({
      by: ["module", "status"],
      where: {
        companyId,
        ...branchFilter,
        ...visibility,
        status: "POSTED",
        journalId: { not: null },
      },
      _count: true,
      _sum: { amount: true, settled: true },
    }),
  ]);
  const safeMasters = masters.map((m) =>
    m.kind === "EMPLOYEE" && !["ADMIN", "HR", "MANAGER"].includes(role)
      ? {
          ...m,
          data: {
            workId:object(m.data).workId,currentRoster:object(m.data).currentRoster,department:object(m.data).department,projectId:object(m.data).projectId,
            position: object(m.data).position,
            location: object(m.data).location,
          },
        }
      : m,
  );
  return {
    assignedRole:assignedRole(actor,companyId),
    insights: await operationalInsights(actor, companyId, options.branchId),
    permissions: {
      companyWide: !branches.length,
      sourceAccess,
      financialAccess:
        ["ADMIN", "MANAGER", "FINANCE", "AUDITOR"].includes(role) &&
        !branches.length,
    },
    actor,
    companies,
    company,
    role,
    branches: branchList,
    modules: modules.map((m) => ({
      ...m,
      enabled: settings.find((s) => s.key === m.key)?.enabled !== false,
    })),
    masters: safeMasters,
    masterLimit: 5000,
    records,
    total,
    page,
    pageSize: take,
    stock,
    messages: messages.toReversed(),
    stats,
    financialStats,
    imports,
    sourceCount,
    masterFiles:await db.sourceFile.findMany({where:{id:{in:[...new Set(masters.flatMap(m=>[m.sourceFileId,...(Array.isArray(object(m.data).sourceReferences)?object(m.data).sourceReferences as {file?:string}[]:[]).map(r=>r.file)].filter((id):id is string=>!!id)))]}},select:{id:true,name:true}}),
    users,
  };
}
