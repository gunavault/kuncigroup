import { Prisma, type WorkflowStatus } from "@prisma/client";
import { db } from "../db";
import { amount, cents, signedCents, type InputLine } from "../money";
import { insert } from "../accounting";
import {
  authorizeCompany,
  allowedBranches,
  type Actor,
  type AccessError,
} from "../auth";
import {
  atomic,
  json,
  object,
  str,
  recordSchema,
  quantity,
  qty,
  lineValue,
  localTime,
  type Tx,
} from "./shared";
import {
  validateModule,
  validateMaster,
  validateFields,
  distanceMeters,
} from "./validation";
import { definitions, masterDefinitions, financialModules } from "./registry";
import { receiveStock, takeStock } from "./stock";
import { operationalEffects } from "./ancillary";
const reviewerRoles = ["ADMIN", "MANAGER", "FINANCE", "HR"] as const;
const staffModules = new Set([
  "cash-advance",
  "expenses",
  "attendances",
  "timesheets",
  "project",
  "quality",
  "maintenance",
]);
export async function audit(
  tx: Tx,
  actor: Actor,
  companyId: string,
  action: string,
  id: string,
  details: unknown = {},
) {
  await tx.auditEvent.create({
    data: {
      companyId,
      actorId: actor.id,
      action,
      entityId: id,
      details: json(details),
    },
  });
}
async function notify(
  tx: Tx,
  companyId: string,
  branchId: string | null,
  body: string,
  referenceId: string,
) {
  await tx.discussion.create({
    data: {
      companyId,
      branchId,
      channel: "notifikasi",
      authorId: "system",
      authorName: "Sistem ERP",
      body,
      system: true,
      referenceId,
    },
  });
}
async function branchGuard(
  tx: Tx,
  companyId: string,
  branchId?: string | null,
) {
  if (branchId)
    await tx.branch.findFirstOrThrow({
      where: { id: branchId, companyId, active: true },
    });
}
async function referenceGuard(
  tx: Tx,
  companyId: string,
  kind: string,
  id: unknown,
) {
  if (str(id))
    return tx.masterRecord.findFirstOrThrow({
      where: { id: str(id), companyId, kind, active: true },
    });
  return null;
}
async function validateReferences(
  tx: Tx,
  companyId: string,
  key: string,
  data: Record<string, unknown>,
  actor?: Actor,
) {
  const fields =
    definitions.find((d) => d.key === key)?.fields ??
    masterDefinitions[key]?.fields ??
    [];
  for (const f of fields)
    if (f.master && data[f.key]) {
      const m = await referenceGuard(tx, companyId, f.master, data[f.key]);
      if (actor && m?.branchId)
        authorizeCompany(actor, companyId, undefined, m.branchId);
    }
}
export async function saveMaster(actor: Actor, input: unknown) {
  const s = object(input);
  const companyId = str(s.companyId),
    kind = str(s.kind);
  authorizeCompany(
    actor,
    companyId,
    ["EMPLOYEE","DEPARTMENT","POSITION"].includes(kind)
      ? ["ADMIN", "MANAGER", "HR"]
      : ["ADMIN", "MANAGER", "FINANCE", "SUPERVISOR"],
    str(s.branchId) || null,
  );
  const data = validateMaster(kind, s.data);
  data.sourceVerification = "VERIFIED";
  const code = str(s.code).trim(),
    name = str(s.name).trim();
  if (
    !/^[A-Za-z0-9._/-]{1,60}$/.test(code) ||
    name.length < 2 ||
    name.length > 200
  )
    throw new Error("Kode dan nama master tidak valid.");
  return atomic(companyId, async (tx) => {
    await branchGuard(tx, companyId, str(s.branchId) || null);
    await validateReferences(tx, companyId, kind, data, actor);
    const id = str(s.id);
    const old = id
      ? await tx.masterRecord.findFirstOrThrow({
          where: { id, companyId, kind },
        })
      : null;
    if (old?.branchId)
      authorizeCompany(actor, companyId, undefined, old.branchId);
    if (
      kind === "EMPLOYEE" &&
      allowedBranches(actor, companyId).length &&
      !s.branchId
    )
      throw new Error("Cabang karyawan wajib sesuai cakupan akses.");
    if (
      old &&
      kind === "PRODUCT" &&
      (await tx.stockMovement.count({ where: { productId: old.id } }))
    )
      for (const key of ["type", "uom", "trackExpiry"])
        if (str(object(old.data)[key]) !== str(data[key]))
          throw new Error(
            "Jenis, satuan, dan pelacakan lot barang yang sudah bergerak tidak dapat diubah.",
          );
    if (
      data.barcode &&
      (await tx.masterRecord.count({
        where: {
          companyId,
          id: { not: id || undefined },
          data: { path: ["barcode"], equals: str(data.barcode) },
        },
      }))
    )
      throw new Error("Barcode sudah dipakai master lain.");
    if (kind === "BOM") {
      const product = await referenceGuard(
        tx,
        companyId,
        "PRODUCT",
        data.productId,
      );
      if (object(product?.data).type !== "STOCK")
        throw new Error("Produk hasil harus barang persediaan.");
      parseIngredients(data);
      if (
        old &&
        (await tx.businessRecord.count({
          where: {
            companyId,
            module: "manufacturing",
            status: { in: ["APPROVED", "POSTED"] },
            data: { path: ["bomId"], equals: old.id },
          },
        }))
      )
        throw new Error(
          "BOM yang sudah dipakai harus direvisi dengan kode baru.",
        );
      for (const i of parseIngredients(data)) {
        if (i.productId === data.productId)
          throw new Error("Bahan tidak boleh sama dengan produk hasil.");
        const p = await referenceGuard(tx, companyId, "PRODUCT", i.productId);
        if (object(p?.data).type !== "STOCK")
          throw new Error("Semua bahan harus barang persediaan.");
      }
    }
    const values = {
      companyId,
      kind,
      code,
      name,
      branchId: str(s.branchId) || null,
      data: json(data),
      active: s.active !== false,
    };
    const result = old
      ? await tx.masterRecord.update({ where: { id: old.id }, data: values })
      : await tx.masterRecord.create({ data: values });
    if (old?.sourceKey)
      await tx.importRow.updateMany({
        where: { targetId: old.id, status: "REVIEW" },
        data: {
          status: "VERIFIED",
          issue: "Master ditinjau dan disimpan oleh pengguna berwenang.",
        },
      });
    await audit(
      tx,
      actor,
      companyId,
      old ? "MASTER_UPDATED" : "MASTER_CREATED",
      result.id,
      { kind, code },
    );
    return result;
  });
}
function parseIngredients(data: Record<string, unknown>) {
  const lines = str(data.ingredients)
    .split(/\r?\n/)
    .filter((x) => x.trim())
    .map((x) => {
      const [productId, n] = x.split("=").map((x) => x.trim());
      return { productId, quantity: quantity(n) };
    });
  if (
    !lines.length ||
    lines.length > 100 ||
    new Set(lines.map((l) => l.productId)).size !== lines.length
  )
    throw new Error(
      "BOM wajib memiliki 1–100 bahan unik dengan format ID produk = jumlah.",
    );
  return lines;
}
export async function saveRecord(actor: Actor, input: unknown) {
  const s = recordSchema.parse(input);
  const {assignedRole}=await import('../auth');
  const {employeeModules}=await import('../roles');
  if(assignedRole(actor,s.companyId)==='EMPLOYEE'&&!employeeModules.has(s.module)) throw new Error('Modul di luar layanan mandiri karyawan.');
  const role = authorizeCompany(actor, s.companyId, undefined, s.branchId);
  if (
    ["AUDITOR", "HR"].includes(role) &&
    !(
      role === "HR" &&
      ["attendances", "timesheets", "shifts"].includes(s.module)
    )
  )
    throw new Error("Peran ini tidak dapat membuat transaksi.");
  if (role === "STAFF" && !staffModules.has(s.module))
    throw new Error("Modul tidak diizinkan untuk staf.");
  const m = definitions.find((m) => m.key === s.module);
  if (!m) throw new Error("Modul tidak ditemukan.");
  if (allowedBranches(actor, s.companyId).length && !s.branchId)
    throw new Error("Cabang wajib untuk cakupan akses Anda.");
  const data = validateModule(s.module, s.data);
  for (const f of m.fields)
    if (f.type === "datetime-local" && data[f.key])
      data[f.key] = localTime(data[f.key]);
  return atomic(s.companyId, async (tx) => {
    await branchGuard(tx, s.companyId, s.branchId);
    const setting = await tx.moduleSetting.findUnique({
      where: { companyId_key: { companyId: s.companyId, key: s.module } },
    });
    if (setting?.enabled === false)
      throw new Error("Modul sedang dinonaktifkan.");
    await validateReferences(tx, s.companyId, s.module, data, actor);
    if (role === "STAFF" && data.employeeId) {
      const employee = await referenceGuard(
        tx,
        s.companyId,
        "EMPLOYEE",
        data.employeeId,
      );
      if (object(employee?.data).userId !== actor.id)
        throw new Error(
          "Akun staf hanya dapat membuat transaksi untuk dirinya sendiri.",
        );
    }
    if (s.module === "sales" || s.module === "purchase") {
      const partner = await referenceGuard(
        tx,
        s.companyId,
        "PARTNER",
        data.partnerId,
      );
      if (
        partner &&
        !["BOTH", s.module === "sales" ? "CUSTOMER" : "VENDOR"].includes(
          str(object(partner.data).type),
        )
      )
        throw new Error("Jenis partner tidak sesuai transaksi.");
    }
    const existing = s.id
      ? await tx.businessRecord.findFirstOrThrow({
          where: { id: s.id, companyId: s.companyId, module: s.module },
          include: { lines: true },
        })
      : null;
    if (
      existing?.status === "IMPORTED" &&
      str(data.reviewNote).trim().length < 10
    )
      throw new Error(
        "Catatan verifikasi sumber minimal 10 karakter wajib diisi.",
      );
    if (
      existing &&
      (!["DRAFT", "IMPORTED", "REJECTED"].includes(existing.status) ||
        s.version !== existing.version)
    )
      throw new Error(
        "Dokumen sudah berubah atau terkunci. Muat ulang sebelum mengedit.",
      );
    if (
      existing &&
      existing.actorId !== actor.id &&
      !["ADMIN", "MANAGER", "FINANCE", "HR"].includes(role)
    )
      throw new Error("Dokumen hanya dapat diedit pembuatnya.");
    const lines = [];
    let total = 0n;
    for (const line of s.lines) {
      if (line.productId) {
        const p = await referenceGuard(
          tx,
          s.companyId,
          "PRODUCT",
          line.productId,
        );
        if (p?.branchId)
          authorizeCompany(actor, s.companyId, undefined, p.branchId);
      }
      const n = quantity(line.quantity),
        value = lineValue(n, line.unitPrice);
      total += cents(value);
      lines.push({
        ...line,
        quantity: qty(n),
        total: value,
        data: json(line.data),
      });
    }
    if (m.lines && !lines.length)
      throw new Error("Dokumen wajib memiliki setidaknya satu baris.");
    if (s.module === "payments") total = cents(str(data.amount));
    if (s.module === "maintenance") total = cents(str(data.cost || "0"));
    const taxPercent = str(data.taxPercent || "0");
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(taxPercent) || Number(taxPercent) > 100)
      throw new Error("Persentase pajak harus 0–100.");
    const [whole, fraction = ""] = taxPercent.split(".");
    const bps = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
    const tax = (total * bps + 500000n) / 1000000n;
    if (["sales", "purchase", "pos"].includes(s.module)) {
      data.subtotal = amount(total);
      data.tax = amount(tax);
      total += tax;
    }
    if (financialModules.has(s.module) && total <= 0n)
      throw new Error("Nilai transaksi keuangan harus lebih besar dari nol.");
    if (["timesheets", "shifts"].includes(s.module)) {
      const start = new Date(str(data.startAt)),
        end = new Date(str(data.endAt));
      if (end <= start || end.getTime() - start.getTime() > 24 * 3600000)
        throw new Error(
          "Jam kerja harus berurutan dan maksimal 24 jam per catatan.",
        );
      data.minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      const rate = cents(str(data.hourlyRate || "0"));
      total = (rate * BigInt(Number(data.minutes)) + 30n) / 60n;
    }
    if (s.module === "attendances") {
      const lat = Number(data.latitude),
        lon = Number(data.longitude),
        accuracy = Number(data.accuracy);
      if (
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180 ||
        accuracy < 0 ||
        accuracy > 10000
      )
        throw new Error("Koordinat atau akurasi GPS tidak valid.");
      if (
        data.checkOut &&
        new Date(str(data.checkOut)) < new Date(str(data.checkIn))
      )
        throw new Error("Check-out mendahului check-in.");
      if (!s.branchId)
        throw new Error("Pilih cabang untuk validasi radius GPS.");
      const b = await tx.branch.findUniqueOrThrow({
        where: { id: s.branchId },
      });
      data.distance =
        b.latitude === null || b.longitude === null
          ? null
          : Math.round(
              distanceMeters(lat, lon, Number(b.latitude), Number(b.longitude)),
            );
      data.geofence =
        data.distance === null
          ? "UNCONFIGURED"
          : Number(data.distance) + accuracy <= b.radius
            ? "INSIDE"
            : "OUTSIDE";
    }
    if (s.module === "quality") {
      if (
        data.minimum !== undefined &&
        data.minimum !== "" &&
        data.maximum !== undefined &&
        data.maximum !== "" &&
        Number(data.minimum) > Number(data.maximum)
      )
        throw new Error("Rentang suhu tidak valid.");
      const failed =
        data.temperature !== undefined &&
        data.temperature !== "" &&
        ((data.minimum !== undefined &&
          data.minimum !== "" &&
          Number(data.temperature) < Number(data.minimum)) ||
          (data.maximum !== undefined &&
            data.maximum !== "" &&
            Number(data.temperature) > Number(data.maximum)));
      if (failed && data.result !== "FAIL")
        throw new Error("Suhu di luar batas. Hasil wajib FAIL.");
      if (data.lotId) {
        await tx.stockLot.findFirstOrThrow({
          where: { id: str(data.lotId), companyId: s.companyId },
        });
        for (const key of ["temperature", "minimum", "maximum"])
          if (data[key] === undefined || data[key] === "")
            throw new Error(
              "QC lot bahan memerlukan suhu terukur dan kedua batas suhu.",
            );
      }
    }
    const company = await tx.company.update({
      where: { id: s.companyId },
      data: { sequence: { increment: existing ? 0 : 1 } },
    });
    const values = {
      companyId: s.companyId,
      branchId: s.branchId || null,
      module: s.module,
      title: s.title,
      date: new Date(`${s.date}T00:00:00Z`),
      data: json(data),
      amount: amount(total),
    };
    let result;
    if (existing) {
      await tx.businessRecord.update({
        where: { id: existing.id },
        data: { status: "DRAFT" },
      });
      await tx.businessLine.deleteMany({ where: { recordId: existing.id } });
      result = await tx.businessRecord.update({
        where: { id: existing.id },
        data: {
          ...values,
          status: "DRAFT",
          version: { increment: 1 },
          lines: { create: lines },
        },
        include: { lines: true },
      });
    } else
      result = await tx.businessRecord.create({
        data: {
          ...values,
          actorId: actor.id,
          number: `${s.companyId}-${s.module.toUpperCase().slice(0, 4)}-${String(company.sequence).padStart(6, "0")}`,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    if (existing?.sourceKey)
      await tx.importRow.updateMany({
        where: { targetId: existing.id, status: "REVIEW" },
        data: {
          status: "VERIFIED",
          issue: "Draft divalidasi oleh pengguna; belum diposting.",
        },
      });
    await audit(
      tx,
      actor,
      s.companyId,
      existing ? "DOCUMENT_UPDATED" : "DOCUMENT_CREATED",
      result.id,
      { module: s.module, number: result.number },
    );
    return result;
  });
}
async function periodFor(tx: Tx, companyId: string, date: Date) {
  let p = await tx.fiscalPeriod.findFirst({
    where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (p?.status === "CLOSED")
    throw new Error("Periode fiskal tanggal transaksi sudah ditutup.");
  if (!p) {
    const start = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
      ),
      end = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      );
    p = await tx.fiscalPeriod.create({
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
  }
  return p;
}
async function accountMap(tx: Tx, companyId: string) {
  const c = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const config = object(object(c.settings).accounting);
  const required = [
    "cash",
    "bank",
    "receivable",
    "payable",
    "revenue",
    "inventory",
    "advance",
    "expense",
    "cogs",
    "taxInput",
    "taxOutput",
    "withholding",
    "withheldPayable",
    "clearing",
  ];
  const map: Record<string, string> = {};
  for (const k of required) {
    if (!config[k])
      throw new Error(`Pemetaan akun ${k} belum dikonfigurasi di Settings.`);
    const a = await tx.account.findUniqueOrThrow({
      where: { id: str(config[k]) },
    });
    if (!a.active) throw new Error(`Akun ${k} tidak aktif.`);
    map[k] = a.id;
  }
  return map;
}
function add(lines: InputLine[], accountId: string, value: bigint) {
  if (value !== 0n)
    lines.push({
      accountId,
      debit: amount(value > 0n ? value : 0n),
      credit: amount(value < 0n ? -value : 0n),
    });
}
function grouped(lines: InputLine[]) {
  const sums = new Map<string, bigint>();
  for (const l of lines)
    sums.set(
      l.accountId,
      (sums.get(l.accountId) ?? 0n) + cents(l.debit) - cents(l.credit),
    );
  return [...sums]
    .filter(([, n]) => n !== 0n)
    .map(([accountId, n]) => ({
      accountId,
      debit: amount(n > 0n ? n : 0n),
      credit: amount(n < 0n ? -n : 0n),
    }));
}
export async function transitionRecord(actor: Actor, input: unknown) {
  const s = object(input);
  const id = str(s.id),
    companyId = str(s.companyId),
    action = str(s.action);
  return atomic(companyId, async (tx) => {
    const r = await tx.businessRecord.findFirstOrThrow({
      where: { id, companyId },
      include: { lines: true },
    });
    const role = authorizeCompany(actor, companyId, undefined, r.branchId);
    const {assignedRole}=await import('../auth');
    const {employeeModules}=await import('../roles');
    if(assignedRole(actor,companyId)==='EMPLOYEE'&&!employeeModules.has(r.module))throw new Error('Tindakan di luar layanan mandiri karyawan.');
    const d = object(r.data);
    if (role === "AUDITOR")
      throw new Error("Auditor hanya dapat membaca data.");
    if (
      role === "HR" &&
      !["attendances", "timesheets", "shifts"].includes(r.module)
    )
      throw new Error("Transaksi di luar kewenangan HR.");
    if (Number(s.version) !== r.version)
      throw new Error("Versi dokumen berubah. Muat ulang.");
    if (
      (
        await tx.moduleSetting.findUnique({
          where: { companyId_key: { companyId, key: r.module } },
        })
      )?.enabled === false
    )
      throw new Error("Modul dinonaktifkan.");
    let status: WorkflowStatus;
    if (action === "submit") {
      if (r.status !== "DRAFT")
        throw new Error("Hanya draft yang dapat diajukan.");
      if (
        r.actorId !== actor.id &&
        !["ADMIN", "MANAGER", "FINANCE", "HR"].includes(role)
      )
        throw new Error("Hanya pembuat atau pengelola dapat mengajukan.");
      validateModule(r.module, d);
      status = "SUBMITTED";
      if (r.module === "attendances" && d.geofence !== "INSIDE")
        await notify(
          tx,
          companyId,
          r.branchId,
          `Pemeriksaan absensi ${r.number}: GPS ${str(d.geofence)}. Perlu tinjauan supervisor.`,
          r.id,
        );
    } else if (action === "approve") {
      if (r.status !== "SUBMITTED") throw new Error("Dokumen belum diajukan.");
      if (!["ADMIN", "MANAGER", "FINANCE", "HR"].includes(role))
        throw new Error("Memerlukan hak persetujuan.");
      if (!actor.superuser && r.actorId === actor.id)
        throw new Error("Pembuat tidak dapat menyetujui pengajuannya sendiri.");
      if (
        role === "HR" &&
        !["attendances", "timesheets", "shifts"].includes(r.module)
      )
        throw new Error("HR tidak dapat menyetujui transaksi ini.");
      if (
        r.module === "attendances" &&
        d.geofence !== "INSIDE" &&
        str(d.overrideReason).length < 10
      )
        throw new Error(
          "Alasan pengecualian GPS minimal 10 karakter wajib diisi sebelum persetujuan.",
        );
      status = "APPROVED";
    } else if (action === "reject") {
      if (
        !["SUBMITTED", "APPROVED"].includes(r.status) ||
        !["ADMIN", "MANAGER", "FINANCE", "HR"].includes(role)
      )
        throw new Error("Penolakan tidak diizinkan.");
      if (str(s.reason).trim().length < 3)
        throw new Error("Alasan penolakan wajib diisi.");
      d.rejectionReason = str(s.reason);
      status = "REJECTED";
    } else if (action === "cancel") {
      if (
        !["DRAFT", "IMPORTED", "REJECTED"].includes(r.status) ||
        (r.actorId !== actor.id &&
          !["ADMIN", "MANAGER", "FINANCE"].includes(role))
      )
        throw new Error("Pembatalan tidak diizinkan.");
      status = "CANCELLED";
    } else if (action === "post") {
      if (r.status !== "APPROVED")
        throw new Error("Dokumen harus disetujui sebelum diposting.");
      const needsFinance =
        financialModules.has(r.module) ||
        (r.module === "inventory" && d.operation !== "TRANSFER") ||
        (r.module === "maintenance" && cents(r.amount) > 0n);
      if (needsFinance && !["ADMIN", "FINANCE"].includes(role))
        throw new Error(
          "Posting yang berdampak pembukuan memerlukan Finance atau Admin.",
        );
      if (
        !needsFinance &&
        !["ADMIN", "MANAGER", "SUPERVISOR", "HR", "FINANCE"].includes(role)
      )
        throw new Error("Tidak memiliki hak finalisasi.");
      await effects(tx, actor, r);
      status = "POSTED";
    } else throw new Error("Aksi dokumen tidak dikenal.");
    const result = await tx.businessRecord.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
        ...(action === "approve" ? { approvedBy: actor.id } : {}),
        ...(action === "reject" ? { data: json(d) } : {}),
      },
      include: { lines: true },
    });
    await audit(tx, actor, companyId, `DOCUMENT_${status}`, id, {
      number: r.number,
      module: r.module,
      reason: s.reason ?? null,
    });
    if (action === "submit" || action === "approve")
      await notify(
        tx,
        companyId,
        r.branchId,
        `${r.number} ${status === "SUBMITTED" ? "menunggu persetujuan" : "telah disetujui"}.`,
        id,
      );
    return result;
  });
}
type FullRecord = Prisma.BusinessRecordGetPayload<{ include: { lines: true } }>;
async function effects(tx: Tx, actor: Actor, r: FullRecord) {
  const d = object(r.data),
    companyId = r.companyId,
    branchId = r.branchId,
    module = r.module;
  const lines: InputLine[] = [];
  const total = cents(r.amount);
  let settled = 0n;
  await operationalEffects(tx, actor, r, notify);
  for (const f of definitions.find((m) => m.key === module)?.fields ?? []) {
    if (f.master && d[f.key]) {
      const master = await referenceGuard(tx, companyId, f.master, d[f.key]);
      if (object(master?.data).sourceVerification === "PENDING")
        throw new Error(`Verifikasi master ${master?.name} sebelum posting.`);
    }
  }
  for (const line of r.lines) {
    if (line.productId) {
      const product = await referenceGuard(
        tx,
        companyId,
        "PRODUCT",
        line.productId,
      );
      if (object(product?.data).sourceVerification === "PENDING")
        throw new Error(`Verifikasi barang ${product?.name} sebelum posting.`);
    }
  }
  if (["inventory", "manufacturing"].includes(module))
    await periodFor(tx, companyId, r.date);
  const financial =
    financialModules.has(module) ||
    (module === "inventory" && d.operation !== "TRANSFER") ||
    (module === "maintenance" && total > 0n);
  const a = financial ? await accountMap(tx, companyId) : {};
  const stockBase = {
    companyId,
    branchId: branchId ?? "",
    recordId: r.id,
    warehouseId: str(d.warehouseId),
    date: r.date,
  };
  if (["sales", "purchase", "pos"].includes(module)) {
    if (
      module === "pos" &&
      (await tx.businessRecord.count({
        where: {
          companyId,
          branchId,
          module: "pos-close",
          status: "POSTED",
          date: r.date,
          data: { path: ["shift"], equals: str(d.shift) },
        },
      }))
    )
      throw new Error("Sif kasir sudah ditutup.");
    if (
      (module === "sales" && d.documentType && d.documentType !== "INVOICE") ||
      (module === "purchase" && d.documentType && d.documentType !== "BILL")
    )
      return;
    const tax = cents(str(d.tax || "0")),
      subtotal = cents(str(d.subtotal ?? r.amount));
    if (module === "purchase") {
      add(lines, a.payable, -total);
      if (tax) add(lines, a.taxInput, tax);
      for (const l of r.lines) {
        const p = l.productId
          ? await referenceGuard(tx, companyId, "PRODUCT", l.productId)
          : null;
        if (p && object(p.data).type === "STOCK") {
          if (!branchId) throw new Error("Cabang penerimaan wajib dipilih.");
          const ld = object(l.data);
          await receiveStock(tx, {
            ...stockBase,
            productId: p.id,
            lotCode: str(ld.lotCode) || r.number,
            expiresAt: str(ld.expiresAt) || undefined,
            quantity: quantity(l.quantity),
            value: cents(l.total),
          });
          add(lines, a.inventory, cents(l.total));
        } else add(lines, a.expense, cents(l.total));
      }
    } else {
      add(
        lines,
        module === "pos"
          ? d.paymentMethod === "BANK"
            ? a.bank
            : a.cash
          : a.receivable,
        total,
      );
      add(lines, a.revenue, -subtotal);
      add(lines, a.taxOutput, -tax);
      if (module === "pos") settled = total;
      for (const l of r.lines) {
        const p = l.productId
          ? await referenceGuard(tx, companyId, "PRODUCT", l.productId)
          : null;
        if (p && object(p.data).type === "STOCK") {
          if (!branchId)
            throw new Error("Cabang/gudang wajib untuk penjualan barang.");
          const consumed = await takeStock(tx, {
            ...stockBase,
            productId: p.id,
            quantity: quantity(l.quantity),
            scannedLot: str(object(l.data).lotCode) || undefined,
          });
          add(lines, a.cogs, consumed.value);
          add(lines, a.inventory, -consumed.value);
        }
      }
    }
  } else if (module === "cash-advance") {
    add(lines, a.advance, total);
    add(lines, a.cash, -total);
  } else if (module === "expenses") {
    const attachment = await tx.attachment.findFirst({
      where: { id: str(d.attachmentId), companyId },
    });
    if (!attachment)
      throw new Error(
        "Bukti transaksi sah harus diunggah pada perusahaan yang sama.",
      );
    if (
      await tx.businessRecord.count({
        where: {
          companyId,
          module: "expenses",
          status: "POSTED",
          data: { path: ["attachmentId"], equals: attachment.id },
        },
      })
    )
      throw new Error("Bukti ini sudah digunakan pada klaim yang diposting.");
    add(lines, a.expense, total);
    let covered = 0n;
    if (d.advanceId) {
      const adv = await tx.businessRecord.findFirstOrThrow({
        where: {
          companyId,
          module: "cash-advance",
          status: "POSTED",
          OR: [{ id: str(d.advanceId) }, { number: str(d.advanceId) }],
        },
      });
      if (object(adv.data).employeeId !== d.employeeId)
        throw new Error("Pemegang kasbon berbeda dengan pengaju klaim.");
      authorizeCompany(actor, companyId, undefined, adv.branchId);
      if (adv.branchId !== branchId)
        throw new Error("Kasbon dan klaim harus pada cabang yang sama.");
      const remaining = cents(adv.amount) - cents(adv.settled);
      covered = remaining < total ? remaining : total;
      if (covered > 0n) {
        await tx.businessRecord.update({
          where: { id: adv.id },
          data: {
            settled: amount(cents(adv.settled) + covered),
            version: { increment: 1 },
          },
        });
        add(lines, a.advance, -covered);
      }
    }
    settled = covered;
    add(lines, a.payable, -(total - covered));
  } else if (module === "payments") {
    const ref = await tx.businessRecord.findFirstOrThrow({
      where: {
        companyId,
        status: "POSTED",
        OR: [{ id: str(d.referenceId) }, { number: str(d.referenceId) }],
      },
    });
    authorizeCompany(actor, companyId, undefined, ref.branchId);
    if (ref.branchId !== branchId)
      throw new Error("Cabang pembayaran harus sama dengan dokumen referensi.");
    const withholding = cents(str(d.withheldAmount || "0")),
      paid = total + withholding,
      remaining = cents(ref.amount) - cents(ref.settled);
    if (
      withholding > 0n &&
      !(await tx.attachment.count({
        where: { id: str(d.attachmentId), companyId },
      }))
    )
      throw new Error("Unggah bukti potong untuk pemotongan pajak.");
    if (paid > remaining) throw new Error("Pembayaran melebihi saldo dokumen.");
    if (total <= 0n) throw new Error("Nilai kas harus positif.");
    if (
      d.direction === "RECEIVE" &&
      ref.module === "sales" &&
      (!object(ref.data).documentType ||
        object(ref.data).documentType === "INVOICE")
    ) {
      add(lines, a.bank, total);
      add(lines, a.withholding, withholding);
      add(lines, a.receivable, -paid);
    } else if (
      d.direction === "PAY" &&
      ["purchase", "expenses", "maintenance"].includes(ref.module) &&
      (!object(ref.data).documentType ||
        object(ref.data).documentType === "BILL")
    ) {
      add(lines, a.payable, paid);
      add(lines, a.bank, -total);
      if (withholding) {
        if (!a.withheldPayable)
          throw new Error("Akun utang pajak belum dipetakan.");
        add(lines, a.withheldPayable, -withholding);
      }
    } else if (
      d.direction === "ADVANCE_RETURN" &&
      ref.module === "cash-advance"
    ) {
      if (withholding)
        throw new Error("Pengembalian kasbon tidak memuat pemotongan pajak.");
      add(lines, a.cash, total);
      add(lines, a.advance, -total);
    } else throw new Error("Jenis pembayaran tidak sesuai dokumen referensi.");
    await tx.businessRecord.update({
      where: { id: ref.id },
      data: {
        settled: amount(cents(ref.settled) + paid),
        version: { increment: 1 },
      },
    });
    settled = total;
  } else if (module === "inventory") {
    if (!branchId) throw new Error("Cabang wajib untuk mutasi stok.");
    if(d.sourceStockFactId){
      const source=await tx.sourceFact.findFirstOrThrow({where:{id:str(d.sourceStockFactId),companyId,kind:'STOCK_SNAPSHOT',status:'REVIEWED'}});
      if(d.operation!=='RECEIVE'||r.lines.length!==1||r.lines[0].productId!==source.productId||source.branchId!==branchId||!source.quantity||quantity(r.lines[0].quantity)!==quantity(source.quantity))throw new Error('Draft saldo awal harus sesuai produk, cabang, dan jumlah sumber yang ditinjau.');
    }
    for (const l of r.lines) {
      if (!l.productId) throw new Error("Setiap baris stok memerlukan produk.");
      const ld = object(l.data);
      if (d.operation === "RECEIVE") {
        await receiveStock(tx, {
          ...stockBase,
          productId: l.productId,
          lotCode: str(ld.lotCode) || r.number,
          expiresAt: str(ld.expiresAt) || undefined,
          quantity: quantity(l.quantity),
          value: cents(l.total),
        });
        add(lines, a.inventory, cents(l.total));
        add(lines, a.clearing, -cents(l.total));
      } else {
        const taken = await takeStock(tx, {
          ...stockBase,
          productId: l.productId,
          quantity: quantity(l.quantity),
          scannedLot: str(ld.lotCode) || undefined,
        });
        if (d.operation === "TRANSFER") {
          const destination = await referenceGuard(
            tx,
            companyId,
            "WAREHOUSE",
            d.destinationId,
          );
          if (!destination?.branchId || destination.id === d.warehouseId)
            throw new Error("Gudang tujuan harus berbeda dan memiliki cabang.");
          authorizeCompany(actor, companyId, undefined, destination.branchId);
          for (const item of taken.allocations)
            await receiveStock(tx, {
              companyId,
              branchId: destination.branchId,
              recordId: r.id,
              warehouseId: destination.id,
              productId: l.productId,
              date: r.date,
              lotCode: item.lot.lotCode,
              expiresAt: item.lot.expiresAt?.toISOString().slice(0, 10),
              quantity: item.quantity,
              value: item.value,
            });
        } else {
          add(lines, a.expense, taken.value);
          add(lines, a.inventory, -taken.value);
        }
      }
    }
  } else if (module === "manufacturing") {
    if (!branchId) throw new Error("Cabang produksi wajib.");
    const bom = await referenceGuard(tx, companyId, "BOM", d.bomId);
    const bd = object(bom?.data),
      out = quantity(d.quantity),
      standard = quantity(bd.outputQuantity);
    let cost = 0n;
    for (const ingredient of parseIngredients(bd)) {
      const need = (ingredient.quantity * out + standard - 1n) / standard;
      cost += (
        await takeStock(tx, {
          ...stockBase,
          productId: ingredient.productId,
          quantity: need,
        })
      ).value;
    }
    await receiveStock(tx, {
      ...stockBase,
      productId: str(bd.productId),
      lotCode: str(d.lotCode),
      expiresAt: str(d.expiresAt),
      quantity: out,
      value: cost,
    });
    d.productionCost = amount(cost);
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { data: json(d), amount: amount(cost) },
    });
  } else if (module === "quality") {
    if (d.lotId) {
      const lot = await tx.stockLot.findFirstOrThrow({
        where: { id: str(d.lotId), companyId },
      });
      authorizeCompany(actor, companyId, undefined, lot.branchId);
      if (
        d.result === "PASS" &&
        lot.quarantined &&
        str(d.correctiveAction).length < 10
      )
        throw new Error(
          "Pelepasan karantina memerlukan bukti tindakan koreksi.",
        );
      await tx.stockLot.update({
        where: { id: lot.id },
        data: { quarantined: d.result === "FAIL" },
      });
    }
    if (d.result === "FAIL")
      await notify(
        tx,
        companyId,
        branchId,
        `QC gagal pada ${r.number}: ${str(d.checklist)}. Lot terkait dikarantina.`,
        r.id,
      );
  } else if (module === "maintenance") {
    const asset = await referenceGuard(tx, companyId, "ASSET", d.assetId);
    if (!asset) throw new Error("Aset tidak ditemukan.");
    await tx.masterRecord.update({
      where: { id: asset.id },
      data: {
        data: json({
          ...object(asset.data),
          nextMaintenance: d.nextDueDate ?? "",
          lastMaintenance: r.date.toISOString().slice(0, 10),
        }),
      },
    });
    if (total > 0n) {
      add(lines, a.expense, total);
      add(lines, a.payable, -total);
    }
  } else if (module === "project") {
    if (Number(d.completion) !== 100 || !str(d.acceptance).trim())
      throw new Error(
        "Penyelesaian WO wajib 100% dan memiliki referensi BAST.",
      );
    d.completedAt = new Date().toISOString();
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { data: json(d) },
    });
  } else if (module === "timesheets") {
    const existing = await tx.businessRecord.findMany({
      where: {
        companyId,
        module: r.module,
        status: "POSTED",
        data: { path: ["employeeId"], equals: str(d.employeeId) },
      },
    });
    const start = new Date(str(d.startAt)),
      end = new Date(str(d.endAt));
    if (
      existing.some((e) => {
        const x = object(e.data);
        return new Date(str(x.startAt)) < end && new Date(str(x.endAt)) > start;
      })
    )
      throw new Error(
        "Jam kerja tumpang tindih dengan timesheet yang sudah diposting.",
      );
  }
  const normalized = grouped(lines);
  if (normalized.length) {
    const p = await periodFor(tx, companyId, r.date);
    const entry = await insert(
      tx,
      p.id,
      r.date,
      "GENERAL",
      `${r.number} — ${r.title}`,
      normalized,
      {
        actorId: actor.id,
        branchId: branchId ?? undefined,
        cashActivity: "OPERATING",
        attachmentId: module === "expenses" ? str(d.attachmentId) : undefined,
      },
    );
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { journalId: entry.id, settled: amount(settled) },
    });
  } else if (settled > 0n)
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { settled: amount(settled) },
    });
}
