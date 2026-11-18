import "dotenv/config";
import { db } from "../src/lib/db";
import { bootstrapAdministrator } from "../src/lib/auth";
import { readFileSync, existsSync } from "node:fs";
import { Prisma } from "@prisma/client";
const input = JSON.parse(readFileSync("data/drive-normalized.json", "utf8"));
const settings = {
  cash: "coa-11101",
  bank: "coa-11103",
  receivable: "coa-11202",
  payable: "coa-21101",
  revenue: "coa-41101",
  inventory: "coa-11206",
  advance: "coa-11102",
  expense: "ops-expense",
  cogs: "coa-51101",
  taxInput: "coa-11211",
  taxOutput: "coa-21107",
  withholding: "ops-prepaid-tax",
  withheldPayable: "coa-21106",
  clearing: "ops-stock-clearing",
  capitalId: "coa-31101",
  summaryId: "coa-31105",
  drawingsIds: ["coa-31103"],
};
for (const [id, name, active] of [
  ["KBA", "PT Kunci Berkah Abadi", true],
  ["KCG", "PT Kunci Cipta Gemilang", true],
  ["KCL", "PT Kunci Cahaya Langit", true],
  ["KBL", "KBL — nama legal perlu verifikasi", false],
] as const) {
  await db.company.upsert({
    where: { id },
    create: {
      id,
      code: id,
      name,
      active,
      settings: {
        accounting: settings,
        legalNameSource:
          id === "KBL" ? "Belum diverifikasi" : "Register dan dokumen Drive",
        sourceRoot: "1-bFBlxQLh41BbWvT7be4evYZt7xTkj4X",
      },
    },
    update: {},
  });
  await db.branch.upsert({
    where: { id: `${id}-HO` },
    create: { id: `${id}-HO`, companyId: id, code: "HO", name: "Kantor Pusat" },
    update: {},
  });
}
await db.account.createMany({ data: input.accounts, skipDuplicates: true });
for (const a of [
  {
    id: "ops-expense",
    code: "51199",
    name: "Beban Operasional Lainnya",
    category: "BEBAN",
    normalBalance: "DEBIT",
  },
  {
    id: "ops-prepaid-tax",
    code: "11212",
    name: "Pajak Penghasilan Dibayar di Muka",
    category: "ASET",
    normalBalance: "DEBIT",
  },
  {
    id: "ops-stock-clearing",
    code: "21199",
    name: "Penyeimbang Persediaan — Menunggu Rekonsiliasi",
    category: "KEWAJIBAN",
    normalBalance: "KREDIT",
  },
] as const)
  await db.account.upsert({
    where: { id: a.id },
    create: { ...a, isSystemAccount: true },
    update: {},
  });
for (const b of input.branches)
  await db.branch.upsert({ where: { id: b.id }, create: b, update: {} });
for (let i = 0; i < input.masters.length; i += 100)
  await db.masterRecord.createMany({
    data: input.masters.slice(i, i + 100),
    skipDuplicates: true,
  });
for (const r of input.records) {
  if (await db.businessRecord.findUnique({ where: { sourceKey: r.sourceKey } }))
    continue;
  const { lines, ...record } = r;
  await db.businessRecord.create({
    data: {
      ...record,
      date: new Date(record.date + "T00:00:00Z"),
      status: "IMPORTED",
      actorId: "drive-import",
      lines: { create: lines },
    },
  });
}
for (let i = 0; i < input.rows.length; i += 100)
  await db.importRow.createMany({
    data: input.rows.slice(i, i + 100),
    skipDuplicates: true,
  });
let sources: any[] = [];
if (existsSync("data/drive-inventory.ndjson"))
  sources = readFileSync("data/drive-inventory.ndjson", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const f = JSON.parse(line);
      return Array.isArray(f)
        ? { id: f[0], name: f[1], parentId: f[2], mime: f[3], partial: f[4] }
        : f;
    });
const unique = new Map(sources.map((f) => [f.id, f]));
const findPath = (f: any, seen = new Set<string>()): string => {
  if (f.path) return f.path;
  if (seen.has(f.id)) return f.name;
  seen.add(f.id);
  const p = unique.get(f.parentId);
  return p ? findPath(p, seen) + "/" + f.name : f.name;
};
const parsed = new Map(input.files.map((f: any) => [f.id, f]));
const files = [...unique.values()].map((f) => {
  const path = findPath(f);
  const restricted =
    /akses.*login|password|credential|kata.sandi|api.?key|token/i.test(f.name);
  const companyId = /(^|\/)\d*[ .-]*(KCL|Legalitas KCL)(\/|$)/i.test(path)
    ? "KCL"
    : /(^|\/)\d*[ .-]*(KCG|Legalitas KCG)(\/|$)/i.test(path)
      ? "KCG"
      : /(^|\/)\d*[ .-]*KBL(\/|$)/i.test(path)
        ? "KBL"
        : "KBA";
  const detail: any = parsed.get(f.id);
  return {
    id: f.id,
    companyId,
    name: f.name,
    mime: f.mime,
    parentId: f.parentId,
    path,
    url: restricted
      ? ""
      : (f.url ??
        (f.mime?.endsWith(".folder")
          ? `https://drive.google.com/drive/folders/${f.id}`
          : `https://drive.google.com/file/d/${f.id}/view`)),
    status: restricted
      ? "RESTRICTED"
      : detail
        ? "PARSED"
        : f.partial
          ? "PARTIAL_INDEX"
          : f.mime?.endsWith(".folder")
            ? "FOLDER"
            : "INDEXED",
    modifiedAt: f.modifiedAt ? new Date(f.modifiedAt) : null,
    sha256: detail?.sha256,
    rowCount: detail?.rowCount ?? 0,
    notes: restricted
      ? "Referensi akses/kredensial tidak diimpor."
      : f.partial
        ? "Daftar folder dibatasi konektor pada 100 item; perlu pemeriksaan lanjutan."
        : detail
          ? "Baris sumber dinormalisasi; transaksi tetap memerlukan verifikasi Finance."
          : "Metadata terindeks; isi belum diekstrak ke transaksi.",
  };
});
for (let i = 0; i < files.length; i += 200)
  await db.sourceFile.createMany({
    data: files.slice(i, i + 200),
    skipDuplicates: true,
  });
for (const f of input.files) {
  const name = unique.get(f.id)?.name ?? f.id;
  await db.sourceFile.upsert({
    where: { id: f.id },
    create: {
      id: f.id,
      name,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      path: name,
      url: `https://drive.google.com/file/d/${f.id}/view`,
      sha256: f.sha256,
      rowCount: f.rowCount,
      status: f.rowCount ? "PARSED" : "NO_MAPPED_ROWS",
    },
    update: {
      sha256: f.sha256,
      rowCount: f.rowCount,
      status: f.rowCount ? "PARSED" : "NO_MAPPED_ROWS",
    },
  });
}
const now = new Date(Date.now() + 7 * 3600000),
  start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
for (const companyId of ["KBA", "KCG", "KCL"])
  if (
    !(await db.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: start }, endDate: { gte: start } },
    }))
  )
    await db.fiscalPeriod.create({
      data: {
        companyId,
        name: new Intl.DateTimeFormat("id-ID", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(start),
        startDate: start,
        endDate: end,
      },
    });
if (process.env.APP_PASSWORD) await bootstrapAdministrator();
await db.auditEvent.create({
  data: {
    companyId: "KBA",
    actorId: "drive-import",
    action: "DRIVE_IMPORT_COMPLETED",
    entityId: "1-bFBlxQLh41BbWvT7be4evYZt7xTkj4X",
    details: {
      accounts: input.accounts.length,
      masters: input.masters.length,
      records: input.records.length,
      reviewRows: input.rows.length,
      indexedFiles: files.length,
      noAutomaticPosting: true,
    },
  },
});
console.log(
  JSON.stringify({
    accounts: input.accounts.length,
    masters: input.masters.length,
    records: input.records.length,
    reviewRows: input.rows.length,
    indexedFiles: files.length,
    noAutomaticPosting: true,
  }),
);
await db.$disconnect();
