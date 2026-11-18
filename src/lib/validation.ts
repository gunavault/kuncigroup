import { z } from "zod";
const money = z
  .string()
  .regex(
    /^\d{1,13}(\.\d{1,2})?$/,
    "Gunakan angka tanpa pemisah ribuan, maksimum dua desimal.",
  );
export const journalSchema = z.object({
  periodId: z.string().min(1),
  date: z.iso.date(),
  type: z.enum(["OPENING", "GENERAL", "ADJUSTING"]),
  description: z.string().trim().min(3).max(1000),
  status: z.enum(["DRAFT", "POSTED"]).default("POSTED"),
  attachmentId: z.string().optional(),
  cashActivity: z.enum(["OPERATING", "INVESTING", "FINANCING"]).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        description: z.string().max(500).optional(),
        debit: money,
        credit: money,
      }),
    )
    .min(2)
    .max(200),
});
export const accountSchema = z.object({
  id: z.string().optional(),
  code: z.string().regex(/^\d{3,10}$/),
  name: z.string().trim().min(2).max(150),
  category: z.enum(["ASET", "KEWAJIBAN", "EKUITAS", "PENDAPATAN", "BEBAN"]),
  isCash: z.boolean().default(false),
  isContra: z.boolean().default(false),
});
