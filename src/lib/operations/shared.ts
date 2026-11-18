import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { amount, cents } from "../money";
export type Tx = Prisma.TransactionClient;
export const json = (v: unknown) => v as Prisma.InputJsonValue;
export const object = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const str = (v: unknown) =>
  v === undefined || v === null ? "" : String(v);
export function quantity(v: unknown) {
  const s = str(v);
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(s))
    throw new Error("Kuantitas wajib angka positif, maksimum 3 desimal.");
  const [a, b = ""] = s.split(".");
  const n = BigInt(a) * 1000n + BigInt(b.padEnd(3, "0"));
  if (n <= 0n) throw new Error("Kuantitas harus lebih besar dari nol.");
  return n;
}
export function qty(n: bigint) {
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return `${sign}${a / 1000n}.${String(a % 1000n).padStart(3, "0")}`;
}
export const lineValue = (n: bigint, price: string) =>
  amount((n * cents(price) + 500n) / 1000n);
export async function atomic<T>(
  companyId: string,
  fn: (tx: Tx) => Promise<T>,
  allowInactive = false,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`;
          const c = await tx.company.findUniqueOrThrow({
            where: { id: companyId },
          });
          if (!c.active && !allowInactive)
            throw new Error("Perusahaan tidak aktif.");
          return fn(tx);
        },
        { isolationLevel: "Serializable", timeout: 30000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          (e.code === "P2010" &&
            ["40001", "40P01"].includes(str(e.meta?.code)))) &&
        i < 4
      )
        continue;
      throw e;
    }
  }
  throw new Error("Transaksi bersamaan gagal. Ulangi kembali.");
}
export const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d{1,13}(\.\d{1,2})?$/.test(v),
    "Angka uang harus positif, maksimum dua desimal.",
  );
export const lineSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1).max(500),
  quantity: z.union([z.string(), z.number()]).transform(String),
  unitPrice: money,
  data: z.record(z.string(), z.unknown()).default({}),
});
export const recordSchema = z.object({
  id: z.string().optional(),
  companyId: z.string(),
  branchId: z.string().nullable().optional(),
  module: z.string(),
  title: z.string().trim().min(3).max(250),
  date: z.iso.date(),
  version: z.number().int().positive().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  lines: z.array(lineSchema).max(100).default([]),
});

export function localTime(value: unknown) {
  const s = str(value);
  if (!s) return s;
  return new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? s : s + "+07:00",
  ).toISOString();
}
