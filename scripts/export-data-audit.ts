/** Read-only private snapshot. Never include this output in a release or a commit. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const db = new PrismaClient(), target = process.argv[2] ?? "data/audit-v4/production.json";
try {
  const data = await db.$transaction(async tx => ({
    capturedAt: new Date().toISOString(),
    companies: await tx.company.findMany(), branches: await tx.branch.findMany(),
    masters: await tx.masterRecord.findMany(),
    records: await tx.businessRecord.findMany({ include: { lines: true } }),
    journals: await tx.journalEntry.findMany({ include: { lines: true } }),
    accounts: await tx.account.findMany(), periods: await tx.fiscalPeriod.findMany(),
    lots: await tx.stockLot.findMany(), movements: await tx.stockMovement.findMany(),
    facts: await tx.sourceFact.findMany(),
    sources: await tx.sourceFile.findMany({ select: { id: true, companyId: true, name: true, sha256: true, rowCount: true, status: true, notes: true } }),
    batches: await tx.dataImportBatch.findMany(),
    users: await tx.user.findMany({ select: { id: true, name: true, active: true, mustChangePassword: true, grants: { select: { companyId: true, branchIds: true, role: true, managerId: true, employeeId: true, active: true } } } }),
  }), { isolationLevel: "RepeatableRead", timeout: 120000 });
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(data));
  console.log(JSON.stringify({ snapshot: target, companies: data.companies.length, masters: data.masters.length, records: data.records.length, facts: data.facts.length }));
} finally { await db.$disconnect(); }
