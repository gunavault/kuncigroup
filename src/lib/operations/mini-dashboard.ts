import { Prisma } from "@prisma/client";
import { db } from "../db";
import { authorizeCompany, allowedBranches, AccessError, type Actor } from "../auth";
import { amount, signedCents } from "../money";
import { modules } from "./registry";
import { masterBranchScope } from "./master-scope";
import { sourceScope } from "./source-data";
import { userDirectory } from "./users";

export type MetricCard = { key: string; label: string; value: string | null; format: "count" | "money"; detail: string };
export type MiniDashboard = { module: string; scope: string; cards: MetricCard[]; updatedAt: string };
const count = (key: string, label: string, value: number | null, detail = "Seluruh data dalam cakupan akses"): MetricCard => ({ key, label, value: value === null ? null : String(value), format: "count", detail });
const money = (key: string, label: string, value: bigint | null, detail: string): MetricCard => ({ key, label, value: value === null ? null : amount(value), format: "money", detail });

/** Aggregates the complete authorized set, independently of the register's page size. */
export async function moduleMiniDashboard(actor: Actor, companyId: string, module: string,
  options: { branchId?: string; query?: string; periodId?: string; asOf?: Date } = {}): Promise<MiniDashboard> {
  const role = authorizeCompany(actor, companyId, undefined, options.branchId);
  if (!modules.some(m => m.key === module)) throw new Error("Modul tidak tersedia.");
  const branches = allowedBranches(actor, companyId), own = role === "STAFF";
  const branch = options.branchId ? { branchId: options.branchId } : branches.length ? { branchId: { in: branches } } : {};
  const q = options.query?.trim().slice(0, 150);
  const financial = ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"].includes(role);
  const masterScope = masterBranchScope(branches, options.branchId);
  const ownEmployee = own ? { data: { path: ["userId"], equals: actor.id } } : {};
  const masterCount = (kind: string, extra: Prisma.MasterRecordWhereInput = {}) => db.masterRecord.count({ where: {
    AND: [{ companyId, kind }, masterScope, kind === "EMPLOYEE" ? ownEmployee : {}, extra,
      ...(q ? [{ OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }] : [])],
  } });
  const now = options.asOf ?? new Date();
  let cards: MetricCard[];
  const hrModules = ["employees", "attendances", "timesheets", "project", "quality", "discuss", "apps", "settings"];
  // A hidden module must not become a side channel for aggregate financial data.
  if (role === "HR" && !hrModules.includes(module)) throw new AccessError("Modul di luar akses HR.");
  if (module === "discuss") {
    const where: Prisma.DiscussionWhereInput = { companyId, ...branch, ...(q ? { body: { contains: q, mode: "insensitive" } } : {}) };
    const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const start = new Date(today + "T00:00:00+07:00"), end = new Date(start.getTime() + 86400000);
    const [total, channels, notifications, todayCount, mine] = await Promise.all([
      db.discussion.count({ where }), db.discussion.groupBy({ by: ["channel"], where, _count: true }),
      db.discussion.count({ where: { ...where, system: true } }),
      db.discussion.count({ where: { ...where, createdAt: { gte: start, lt: end } } }),
      db.discussion.count({ where: { ...where, authorId: actor.id } }),
    ]);
    cards = [count("total", "Pesan", total), count("channels", "Kanal", channels.length), count("system", "Notifikasi sistem", notifications), count("today", "Pesan hari ini", todayCount, "Tanggal WIB"), count("mine", "Pesan saya", mine)];
  } else if (module === "employees") {
    const roster = { data: { path: ["currentRoster"], equals: true } };
    const [total, current, active, inactive, historical] = await Promise.all([
      masterCount("EMPLOYEE"), masterCount("EMPLOYEE", roster), masterCount("EMPLOYEE", { AND: [roster, { active: true }] }),
      masterCount("EMPLOYEE", { AND: [roster, { active: false }] }),
      masterCount("EMPLOYEE", { NOT: roster }),
    ]);
    cards = [count("total", "Referensi karyawan", total), count("roster", "Roster terkini", current), count("active", "Roster aktif", active), count("inactive", "Roster nonaktif", inactive), count("historical", "Referensi historis", historical, "Bukan tambahan personel pada roster terkini")];
  } else if (module === "inventory" || module === "barcode") {
    const lotWhere: Prisma.StockLotWhereInput = { companyId, ...branch,
      ...(q ? { productId: { in: (await db.masterRecord.findMany({ where: { companyId, kind: "PRODUCT", OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, select: { id: true } })).map(m => m.id) } } : {}) };
    const [products, locations, lots, quarantine, expired, assets] = await Promise.all([
      masterCount("PRODUCT", { active: true }), masterCount("WAREHOUSE", { active: true }),
      db.stockLot.count({ where: { ...lotWhere, quantity: { gt: 0 } } }),
      db.stockLot.count({ where: { ...lotWhere, quantity: { gt: 0 }, quarantined: true } }),
      db.stockLot.count({ where: { ...lotWhere, quantity: { gt: 0 }, expiresAt: { lt: new Date(new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)) } } }),
      masterCount("ASSET", { active: true }),
    ]);
    cards = [count("products", "Produk aktif", products), count("locations", "Gudang aktif", locations), count("lots", "Lot bersaldo", lots, "Jumlah lot; kuantitas dengan satuan berbeda tidak dijumlahkan"), count("quarantine", "Lot karantina", quarantine), count("expired", "Lot kedaluwarsa", expired), count("assets", "Register aset aktif", assets, "Baris register dapat mewakili lebih dari satu unit")];
  } else if (module === "apps") {
    const settings = await db.moduleSetting.findMany({ where: { companyId } });
    const enabled = new Set(modules.filter(m => settings.find(s => s.key === m.key)?.enabled !== false).map(m => m.key));
    cards = [count("registered", "Aplikasi terdaftar", modules.length), count("enabled", "Aplikasi aktif", enabled.size), count("disabled", "Aplikasi nonaktif", modules.length - enabled.size), count("dependencies", "Dependensi belum aktif", modules.filter(m => enabled.has(m.key) && m.dependencies?.some(d => !enabled.has(d))).length), count("groups", "Kelompok aplikasi", new Set(modules.map(m => m.group)).size)];
  } else if (module === "settings") {
    const permitted = ["ADMIN", "MANAGER", "HR"].includes(role);
    const selectedBranches = options.branchId ? [options.branchId] : branches;
    const users = permitted ? (await userDirectory(actor, companyId)).users.filter(u => u.grants.some(g => g.companyId === companyId && (!selectedBranches.length || g.branchIds.some(id => selectedBranches.includes(id))))) : [];
    cards = [count("users", "Pengguna perusahaan", permitted ? users.length : null), count("active", "Akun aktif", permitted ? users.filter(u => u.active && u.grants.some(g => g.companyId === companyId && g.active)).length : null), count("inactive", "Akses nonaktif", permitted ? users.filter(u => !u.active || !u.grants.some(g => g.companyId === companyId && g.active)).length : null), count("reset", "Wajib ganti sandi", permitted ? users.filter(u => u.mustChangePassword).length : null), count("branches", "Cabang aktif", await db.branch.count({ where: { companyId, active: true, ...(options.branchId ? { id: options.branchId } : branches.length ? { id: { in: branches } } : {}) } }))];
  } else if (module === "accounting" || module === "dashboards") {
    const period = options.periodId ? await db.fiscalPeriod.findFirstOrThrow({ where: { id: options.periodId, companyId } }) : null;
    const where: Prisma.JournalEntryWhereInput = { companyId, ...branch, ...(period ? { fiscalPeriodId: period.id } : {}), ...(q ? { OR: [{ journalNumber: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) };
    if (!financial) cards = [count("posted", "Jurnal terposting", null), count("draft", "Draft jurnal", null), money("debit", "Total debit", null, "Memerlukan akses keuangan"), money("credit", "Total kredit", null, "Memerlukan akses keuangan"), money("balance", "Selisih jurnal", null, "Memerlukan akses keuangan")];
    else {
      const [posted, draft, sums, profit] = await Promise.all([
        db.journalEntry.count({ where: { ...where, status: "POSTED" } }), db.journalEntry.count({ where: { ...where, status: "DRAFT" } }),
        db.journalLine.aggregate({ where: { entry: { ...where, status: "POSTED" } }, _sum: { debit: true, credit: true } }),
        db.journalLine.groupBy({ by: ["accountId"], where: { entry: { ...where, status: "POSTED", type: { not: "CLOSING" } }, account: { category: { in: ["PENDAPATAN", "BEBAN"] } } }, _sum: { debit: true, credit: true } }),
      ]);
      const d = signedCents(sums._sum.debit ?? "0"), c = signedCents(sums._sum.credit ?? "0");
      const note = "Jurnal POSTED dalam cakupan dan periode terpilih";
      if (module === "accounting") cards = [count("posted", "Jurnal terposting", posted), count("draft", "Draft jurnal", draft), money("debit", "Total debit", d, note), money("credit", "Total kredit", c, note), money("balance", "Selisih debit/kredit", d - c, note), count("coa", "Akun aktif", await db.account.count({ where: { active: true } }), "Daftar akun bersama")];
      else {
        const accounts = await db.account.findMany({ where: { id: { in: profit.map(p => p.accountId) } }, select: { id: true, category: true } });
        let revenue = 0n, expense = 0n;
        for (const p of profit) { const delta = signedCents(p._sum.credit ?? "0") - signedCents(p._sum.debit ?? "0"); if (accounts.find(a => a.id === p.accountId)?.category === "PENDAPATAN") revenue += delta; else expense -= delta; }
        const basis = "Jurnal POSTED; jurnal penutup dikecualikan; seluruh periode kecuali dipilih";
        cards = [count("posted", "Jurnal terposting", posted), count("draft", "Draft jurnal", draft), money("revenue", "Pendapatan buku besar", revenue, basis), money("expense", "Beban buku besar", expense, basis), money("profit", "Laba/rugi buku besar", revenue - expense, basis), money("balance", "Selisih jurnal", d - c, note)];
      }
    }
  } else {
    const where: Prisma.BusinessRecordWhereInput = { companyId, ...branch, module,
      ...(own ? { actorId: actor.id } : {}), ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}) };
    const grouped = await db.businessRecord.groupBy({ by: ["status"], where, _count: true });
    const n = (status: string) => grouped.find(g => g.status === status)?._count ?? 0;
    cards = [count("total", "Seluruh dokumen", grouped.reduce((a, g) => a + g._count, 0)), count("draft", "Draft", n("DRAFT")), count("submitted", "Menunggu persetujuan", n("SUBMITTED")), count("approved", "Siap diposting", n("APPROVED")), count("posted", "Dokumen terposting", n("POSTED")), count("imported", "Impor belum diverifikasi", n("IMPORTED"), "Belum menjadi transaksi buku besar")];
    if (["sales", "purchase", "cash-advance", "expenses", "pos"].includes(module)) {
      const aggregate = financial ? await db.businessRecord.aggregate({ where: { ...where, status: "POSTED", journalId: { not: null } }, _sum: { amount: true, settled: true } }) : null;
      const sum = aggregate ? signedCents(aggregate._sum.amount ?? "0") : null;
      const outstanding = aggregate ? sum! - signedCents(aggregate._sum.settled ?? "0") : null;
      cards[3] = module === "pos" ? money("postedValue", "Penjualan bruto terposting", sum, "Hanya dokumen POSTED yang memiliki jurnal") : money("outstanding", "Saldo belum diselesaikan", outstanding, "Hanya dokumen POSTED yang memiliki jurnal; quotation/order dikecualikan");
    }
    if (module === "attendances") {
      const source = sourceScope(actor, companyId, options.branchId).where;
      const sourceWhere: Prisma.SourceFactWhereInput = { AND: [source, { kind: "ATTENDANCE" }] };
      // Source cards describe a separate register, not a second count of operational documents.
      cards[4] = count("sourceDays", "Hari absensi sumber", await db.sourceFact.count({ where: sourceWhere }), "Register sumber; seluruh tanggal; filter teks dokumen tidak berlaku");
      cards[5] = count("sourceReview", "Hari sumber perlu tinjauan", await db.sourceFact.count({ where: { AND: [sourceWhere, { status: { in: ["REVIEW", "IMPORTED", "UNKNOWN", "UNMATCHED"] } }] } }), "Tidak dijumlahkan dengan dokumen operasional");
    }
    if (module === "manufacturing") cards[5] = count("bom", "Resep / BOM aktif", await masterCount("BOM", { active: true }));
    if (module === "project") cards[5] = count("projects", "Master proyek aktif", await masterCount("PROJECT", { active: true }));
  }
  return { module, scope: `${options.branchId ? "Cabang terpilih" : branches.length ? "Cabang dalam hak akses" : "Seluruh perusahaan"}${own ? " · dokumen saya" : ""} · ${options.periodId ? "periode terpilih" : "seluruh periode"}${q && !["apps", "settings"].includes(module) ? " · sesuai pencarian" : ""}`, cards, updatedAt: now.toISOString() };
}
