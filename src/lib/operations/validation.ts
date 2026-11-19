import { z } from "zod";
import { definitions, masterDefinitions, type Field } from "./registry";
import { object, str, quantity } from "./shared";
import { validTaxId } from "./approval";
export function validateFields(fields: Field[], input: unknown) {
  const data = object(input);
  for (const f of fields) {
    const value = data[f.key];
    if (
      f.required &&
      (value === undefined || value === null || str(value).trim() === "")
    )
      throw new Error(`${f.label} wajib diisi.`);
    if (value === undefined || value === null || value === "") continue;
    if (f.type === "number" && !Number.isFinite(Number(value)))
      throw new Error(`${f.label} harus angka.`);
    if (f.type === "date" && !z.iso.date().safeParse(value).success)
      throw new Error(`${f.label} harus tanggal valid.`);
    if (
      f.type === "datetime-local" &&
      Number.isNaN(new Date(str(value)).getTime())
    )
      throw new Error(`${f.label} harus waktu valid.`);
    if (f.options && !f.options.includes(str(value)))
      throw new Error(`${f.label} tidak valid.`);
    if (str(value).length > 12000)
      throw new Error(`${f.label} terlalu panjang.`);
  }
  return data;
}
export function validateModule(key: string, data: unknown) {
  const m = definitions.find((m) => m.key === key);
  if (!m || (!m.fields.length && !m.lines))
    throw new Error("Modul ini tidak menerima dokumen transaksi.");
  return validateFields(m.fields, data);
}
export function validateMaster(kind: string, data: unknown) {
  const m = masterDefinitions[kind];
  if (!m) throw new Error("Jenis master tidak valid.");
  const value = validateFields(m.fields, data);
  if (kind === "BOM") quantity(value.outputQuantity);
  if (kind === "PARTNER" && str(value.taxId).trim() && !validTaxId(value.taxId))
    throw new Error(
      "NPWP harus 15 atau 16 digit, atau NITKU 22 digit. Kosongkan bila belum ada.",
    );
  if (kind === "PURCHASE_QUOTA") {
    if (quantity(str(value.maxQuantity)) <= 0n)
      throw new Error("Kuantitas maksimum kuota harus lebih dari nol.");
    if (
      str(value.startDate) &&
      str(value.endDate) &&
      str(value.endDate) < str(value.startDate)
    )
      throw new Error("Akhir masa kuota mendahului tanggal mulai.");
  }
  for (const key of ["cost", "salePrice", "contractValue", "reorder"])
    if (
      value[key] !== undefined &&
      value[key] !== null &&
      value[key] !== "" &&
      !/^\d{1,13}(\.\d{1,3})?$/.test(str(value[key]))
    )
      throw new Error(
        "Nilai master harus angka positif dengan maksimal 3 desimal.",
      );
  if (
    value.slaTarget !== undefined &&
    value.slaTarget !== "" &&
    (Number(value.slaTarget) < 0 || Number(value.slaTarget) > 100)
  )
    throw new Error("Target SLA harus 0-100.");
  if (value.startAt && value.dueDate && str(value.dueDate) < str(value.startAt))
    throw new Error("Akhir kontrak mendahului tanggal mulai.");
  return value;
}
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const r = 6371000,
    toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
