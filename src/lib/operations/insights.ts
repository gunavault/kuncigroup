import { Prisma } from "@prisma/client";
import { db } from "../db";
import { authorizeCompany, allowedBranches, type Actor } from "../auth";
import { cents, amount, signedCents } from "../money";
import { object, str } from "./shared";
export async function operationalInsights(
  actor: Actor,
  companyId: string,
  branchId?: string,
  asOf = new Date(),
) {
  const role = authorizeCompany(actor, companyId),
    branches = allowedBranches(actor, companyId);
  if (branchId) authorizeCompany(actor, companyId, undefined, branchId);
  const local = new Date(asOf.getTime() + 7 * 3600000),
    month = local.toISOString().slice(0, 7),
    start = new Date(month + "-01T00:00:00Z"),
    end = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1),
    );
  const financial = ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"].includes(role),
    filter = branchId
      ? Prisma.sql`AND e.branch_id=${branchId}`
      : branches.length
        ? Prisma.sql`AND e.branch_id IN (${Prisma.join(branches)})`
        : Prisma.empty;
  const ledger = (from: Date, to: Date) =>
    db.$queryRaw<
      { branchId: string | null; revenue: string; expense: string }[]
    >(
      Prisma.sql`SELECT e.branch_id AS "branchId", SUM(CASE WHEN a.category='PENDAPATAN' THEN l.credit-l.debit ELSE 0 END)::text AS revenue, SUM(CASE WHEN a.category='BEBAN' THEN l.debit-l.credit ELSE 0 END)::text AS expense FROM journal_entries e JOIN journal_lines l ON l.journal_entry_id=e.id JOIN chart_of_accounts a ON a.id=l.account_id WHERE e.company_id=${companyId} AND e.status='POSTED' AND e.type NOT IN ('CLOSING','OPENING') AND e.transaction_date>=${from} AND e.transaction_date<${to} ${filter} GROUP BY e.branch_id`,
    );
  let values = financial ? await ledger(start, end) : [];
  let ledgerMonth = month,
    ledgerBasis: "BULAN_BERJALAN" | "BULAN_TERAKHIR_TERSEDIA" = "BULAN_BERJALAN";
  // No ledger activity this month yet: show the latest month that has postings, labelled as such.
  if (financial && !values.length) {
    const [latest] = await db.$queryRaw<{ d: Date | null }[]>(
      Prisma.sql`SELECT MAX(e.transaction_date) AS d FROM journal_entries e WHERE e.company_id=${companyId} AND e.status='POSTED' AND e.type NOT IN ('CLOSING','OPENING') AND e.transaction_date<${end} ${filter}`,
    );
    if (latest?.d) {
      const m = new Date(latest.d).toISOString().slice(0, 7),
        from = new Date(m + "-01T00:00:00Z"),
        to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
      values = await ledger(from, to);
      ledgerMonth = m;
      ledgerBasis = "BULAN_TERAKHIR_TERSEDIA";
    }
  }
  const branchWhere = branchId
    ? { branchId }
    : branches.length
      ? { branchId: { in: branches } }
      : {};
  const work =
    role === "STAFF"
      ? []
      : await db.businessRecord.findMany({
          where: {
            companyId,
            ...branchWhere,
            module: "project",
            status: { notIn: ["CANCELLED", "REJECTED"] },
            date: { gte: start, lt: end },
          },
          select: { status: true, data: true },
        });
  const projects = new Map<
    string,
    { projectId: string; total: number; completed: number; onTime: number }
  >();
  for (const r of work) {
    const d = object(r.data),
      id = str(d.projectId);
    if (!id) continue;
    const metric = projects.get(id) ?? {
      projectId: id,
      total: 0,
      completed: 0,
      onTime: 0,
    };
    metric.total++;
    if (r.status === "POSTED") {
      metric.completed++;
      const completed = new Date(str(d.completedAt));
      if (
        !Number.isNaN(completed.getTime()) &&
        new Date(completed.getTime() + 7 * 3600000)
          .toISOString()
          .slice(0, 10) <= str(d.dueDate)
      )
        metric.onTime++;
    }
    projects.set(id, metric);
  }
  return {
    month,
    ledgerMonth,
    ledgerBasis,
    financial,
    branches: values.map((v) => ({
      ...v,
      profit: amount(signedCents(v.revenue) - signedCents(v.expense)),
    })),
    projects: [...projects.values()].map((p) => ({
      ...p,
      onTimePercent: p.total ? Math.round((p.onTime / p.total) * 100) : 0,
    })),
  };
}
