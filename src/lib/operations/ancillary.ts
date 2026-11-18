import type { Prisma } from "@prisma/client";
import { authorizeCompany, type Actor } from "../auth";
import { amount, cents } from "../money";
import { json, object, str, type Tx } from "./shared";

type Document = Prisma.BusinessRecordGetPayload<{ include: { lines: true } }>;
type Notify = (
  tx: Tx,
  companyId: string,
  branchId: string | null,
  body: string,
  referenceId: string,
) => Promise<void>;

// These effects run in the same transaction as workflow finalization.
export async function operationalEffects(
  tx: Tx,
  actor: Actor,
  r: Document,
  notify: Notify,
) {
  const d = object(r.data),
    scope = { companyId: r.companyId, branchId: r.branchId };
  if (r.module === "asset-handover") {
    const asset = await tx.masterRecord.findFirstOrThrow({
      where: {
        id: str(d.assetId),
        companyId: r.companyId,
        kind: "ASSET",
        active: true,
      },
    });
    const employee = await tx.masterRecord.findFirstOrThrow({
      where: {
        id: str(d.employeeId),
        companyId: r.companyId,
        kind: "EMPLOYEE",
        active: true,
      },
    });
    if (asset.branchId)
      authorizeCompany(actor, r.companyId, undefined, asset.branchId);
    if (!r.branchId || (employee.branchId && employee.branchId !== r.branchId))
      throw new Error(
        "Cabang serah terima harus sama dengan cabang penerima aset.",
      );
    await tx.masterRecord.update({
      where: { id: asset.id },
      data: {
        branchId: r.branchId,
        data: json({
          ...object(asset.data),
          custodianId: employee.id,
          custodian: employee.name,
          location: d.location,
          condition: d.condition,
          lastHandover: r.number,
        }),
      },
    });
  }
  if (r.module === "shifts") {
    const others = await tx.businessRecord.findMany({
      where: {
        companyId: r.companyId,
        module: "shifts",
        status: "POSTED",
        data: { path: ["employeeId"], equals: str(d.employeeId) },
      },
    });
    const start = new Date(str(d.startAt)),
      end = new Date(str(d.endAt));
    if (
      others.some((x) => {
        const v = object(x.data);
        return new Date(str(v.startAt)) < end && new Date(str(v.endAt)) > start;
      })
    )
      throw new Error("Jadwal sif karyawan tumpang tindih.");
  }
  if (r.module === "attendances") {
    const checkIn = new Date(str(d.checkIn)),
      checkOut = d.checkOut ? new Date(str(d.checkOut)) : null;
    if (
      new Date(checkIn.getTime() + 7 * 3600000).toISOString().slice(0, 10) !==
      r.date.toISOString().slice(0, 10)
    )
      throw new Error(
        "Tanggal absensi harus sama dengan tanggal check-in WIB.",
      );
    const others = await tx.businessRecord.findMany({
      where: {
        companyId: r.companyId,
        module: "attendances",
        status: "POSTED",
        data: { path: ["employeeId"], equals: str(d.employeeId) },
      },
    });
    if (
      others.some((x) => {
        const v = object(x.data),
          start = new Date(str(v.checkIn)),
          end = v.checkOut ? new Date(str(v.checkOut)) : start;
        return (
          start.getTime() === checkIn.getTime() ||
          (checkOut && start < checkOut && end > checkIn)
        );
      })
    )
      throw new Error(
        "Absensi karyawan sudah tercatat atau waktunya tumpang tindih.",
      );
    if (d.shift) {
      const shift = await tx.businessRecord.findFirstOrThrow({
        where: {
          ...scope,
          module: "shifts",
          status: "POSTED",
          OR: [{ number: str(d.shift) }, { id: str(d.shift) }],
        },
      });
      const sd = object(shift.data),
        start = new Date(str(sd.startAt)),
        end = new Date(str(sd.endAt));
      if (
        sd.employeeId !== d.employeeId ||
        checkIn > end ||
        checkIn.getTime() < start.getTime() - 4 * 3600000
      )
        throw new Error(
          "Jadwal sif tidak sesuai karyawan, cabang, atau waktu check-in.",
        );
      d.lateMinutes = Math.max(
        0,
        Math.ceil((checkIn.getTime() - start.getTime()) / 60000),
      );
      d.earlyDepartureMinutes = checkOut
        ? Math.max(0, Math.ceil((end.getTime() - checkOut.getTime()) / 60000))
        : null;
      d.scheduledStart = sd.startAt;
      d.scheduledEnd = sd.endAt;
      if (Number(d.lateMinutes) > 0)
        await notify(
          tx,
          r.companyId,
          r.branchId,
          `Absensi ${r.number}: terlambat ${d.lateMinutes} menit.`,
          r.id,
        );
    }
    d.workedMinutes = checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60000)
      : null;
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { data: json(d) },
    });
  }
  if (r.module === "pos-close") {
    if (!r.branchId) throw new Error("Pilih cabang kasir untuk rekonsiliasi.");
    const sameShift = {
      ...scope,
      date: r.date,
      data: { path: ["shift"], equals: str(d.shift) },
    };
    if (
      await tx.businessRecord.count({
        where: { ...sameShift, module: "pos-close", status: "POSTED" },
      })
    )
      throw new Error("Sif kasir sudah direkonsiliasi.");
    if (
      await tx.businessRecord.count({
        where: {
          ...sameShift,
          module: "pos",
          status: { in: ["IMPORTED", "DRAFT", "SUBMITTED", "APPROVED"] },
        },
      })
    )
      throw new Error(
        "Selesaikan atau batalkan semua transaksi POS pada sif ini terlebih dahulu.",
      );
    const sales = await tx.businessRecord.findMany({
      where: { ...sameShift, module: "pos", status: "POSTED" },
    });
    const expected = sales
        .filter((s) => object(s.data).paymentMethod === "CASH")
        .reduce((n, s) => n + cents(s.amount), 0n),
      variance = cents(str(d.countedCash)) - expected;
    if (variance !== 0n && str(d.notes).trim().length < 10)
      throw new Error("Selisih kas memerlukan penjelasan minimal 10 karakter.");
    d.expectedCash = amount(expected);
    d.variance = amount(variance);
    d.transactionCount = sales.length;
    await tx.businessRecord.update({
      where: { id: r.id },
      data: { data: json(d) },
    });
    if (variance !== 0n)
      await notify(
        tx,
        r.companyId,
        r.branchId,
        `Selisih kas ${r.number}: Rp ${amount(variance)}.`,
        r.id,
      );
  }
}
