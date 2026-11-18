import { amount, cents } from "../money";
import { type Tx, object, str, quantity, qty, lineValue } from "./shared";
export async function receiveStock(
  tx: Tx,
  params: {
    companyId: string;
    branchId: string;
    recordId: string;
    warehouseId: string;
    productId: string;
    lotCode: string;
    expiresAt?: string;
    quantity: bigint;
    value: bigint;
    date: Date;
  },
) {
  const p = params;
  await stockDateGuard(tx, p);
  const product = await tx.masterRecord.findFirstOrThrow({
    where: {
      id: p.productId,
      companyId: p.companyId,
      kind: "PRODUCT",
      active: true,
    },
  });
  const w = await tx.masterRecord.findFirstOrThrow({
    where: {
      id: p.warehouseId,
      companyId: p.companyId,
      kind: "WAREHOUSE",
      branchId: p.branchId,
      active: true,
    },
  });
  void w;
  if (object(product.data).type !== "STOCK")
    throw new Error("Penerimaan stok memerlukan barang persediaan.");
  if (object(product.data).trackExpiry && !p.expiresAt)
    throw new Error(`Tanggal kedaluwarsa wajib untuk ${product.name}.`);
  const unitCost = amount((p.value * 1000n + p.quantity / 2n) / p.quantity);
  const key = {
    companyId: p.companyId,
    warehouseId: p.warehouseId,
    productId: p.productId,
    lotCode: p.lotCode,
  };
  const existing = await tx.stockLot.findUnique({
    where: { companyId_warehouseId_productId_lotCode: key },
  });
  let lot;
  if (existing) {
    if (
      existing.expiresAt?.toISOString().slice(0, 10) !==
      (p.expiresAt || undefined)
    )
      throw new Error("Tanggal kedaluwarsa berbeda untuk nomor lot yang sama.");
    const n =
      (existing.quantity.isZero() ? 0n : quantity(existing.quantity)) +
      p.quantity;
    const value = cents(existing.value) + p.value;
    lot = await tx.stockLot.update({
      where: { id: existing.id },
      data: {
        quantity: qty(n),
        value: amount(value),
        unitCost: amount((value * 1000n + n / 2n) / n),
      },
    });
  } else
    lot = await tx.stockLot.create({
      data: {
        ...key,
        branchId: p.branchId,
        expiresAt: p.expiresAt ? new Date(`${p.expiresAt}T00:00:00Z`) : null,
        quantity: qty(p.quantity),
        value: amount(p.value),
        unitCost,
      },
    });
  await tx.stockMovement.create({
    data: {
      companyId: p.companyId,
      effectiveDate: p.date,
      recordId: p.recordId,
      lotId: lot.id,
      warehouseId: p.warehouseId,
      productId: p.productId,
      quantity: qty(p.quantity),
      value: amount(p.value),
    },
  });
  return lot;
}
export async function takeStock(
  tx: Tx,
  p: {
    companyId: string;
    branchId: string;
    recordId: string;
    warehouseId: string;
    productId: string;
    quantity: bigint;
    date: Date;
    scannedLot?: string;
  },
) {
  await stockDateGuard(tx, p);
  await tx.masterRecord.findFirstOrThrow({
    where: {
      id: p.warehouseId,
      companyId: p.companyId,
      kind: "WAREHOUSE",
      branchId: p.branchId,
      active: true,
    },
  });
  const lots = await tx.stockLot.findMany({
    where: {
      companyId: p.companyId,
      warehouseId: p.warehouseId,
      productId: p.productId,
      quantity: { gt: 0 },
      quarantined: false,
      OR: [{ expiresAt: null }, { expiresAt: { gte: p.date } }],
    },
    orderBy: [
      { expiresAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  if (
    p.scannedLot &&
    lots[0]?.id !== p.scannedLot &&
    lots[0]?.lotCode !== p.scannedLot
  )
    throw new Error(
      "Lot hasil pindai bukan lot FEFO yang harus dikeluarkan lebih dahulu.",
    );
  let remaining = p.quantity,
    total = 0n;
  const allocations: {
    lot: (typeof lots)[number];
    quantity: bigint;
    value: bigint;
  }[] = [];
  for (const lot of lots) {
    if (remaining === 0n) break;
    const available = quantity(lot.quantity),
      take = available < remaining ? available : remaining;
    const value =
      take === available
        ? cents(lot.value)
        : (cents(lot.value) * take + available / 2n) / available;
    await tx.stockLot.update({
      where: { id: lot.id },
      data: {
        quantity: qty(available - take),
        value: amount(cents(lot.value) - value),
      },
    });
    await tx.stockMovement.create({
      data: {
        companyId: p.companyId,
        effectiveDate: p.date,
        recordId: p.recordId,
        lotId: lot.id,
        warehouseId: p.warehouseId,
        productId: p.productId,
        quantity: qty(-take),
        value: amount(-value),
      },
    });
    remaining -= take;
    total += value;
    allocations.push({ lot, quantity: take, value });
  }
  if (remaining > 0n)
    throw new Error(
      "Stok FEFO yang belum kedaluwarsa dan lolos QC tidak mencukupi.",
    );
  return { value: total, allocations };
}

async function stockDateGuard(
  tx: Tx,
  p: { companyId: string; warehouseId: string; productId: string; date: Date },
) {
  if (
    await tx.stockMovement.count({
      where: {
        companyId: p.companyId,
        warehouseId: p.warehouseId,
        productId: p.productId,
        effectiveDate: { gt: p.date },
      },
    })
  )
    throw new Error(
      "Tidak dapat mencatat mutasi sebelum mutasi stok yang lebih baru. Gunakan tanggal yang sesuai atau rekonsiliasi Finance.",
    );
}
