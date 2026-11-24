export const ratioMappingFields = [
  { key: "currentAssetIds", label: "Aset lancar", category: "ASET" },
  { key: "currentLiabilityIds", label: "Liabilitas lancar", category: "KEWAJIBAN" },
  { key: "quickAssetIds", label: "Aset cepat (kas, investasi likuid, piutang)", category: "ASET" },
  { key: "interestBearingDebtIds", label: "Pinjaman berbunga", category: "KEWAJIBAN" },
  { key: "inventoryIds", label: "Persediaan untuk perputaran / DIO", category: "ASET" },
  { key: "receivableIds", label: "Piutang usaha untuk DSO", category: "ASET" },
  { key: "creditSalesRevenueIds", label: "Pendapatan khusus penjualan kredit (neto)", category: "PENDAPATAN" },
  { key: "interestExpenseIds", label: "Beban bunga untuk interest coverage", category: "BEBAN" },
] as const;
export function validateRatioMapping(value: unknown, accounts: { id: string; category: string }[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pemetaan rasio tidak valid.");
  const mapping = value as Record<string, unknown>, result: Record<string, string[]> = {};
  if (Object.keys(mapping).some(key => !ratioMappingFields.some(field => field.key === key))) throw new Error("Jenis pemetaan rasio tidak dikenal.");
  for (const field of ratioMappingFields) {
    const ids = mapping[field.key] ?? [];
    if (!Array.isArray(ids) || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !accounts.some(a => a.id === id && a.category === field.category))) throw new Error(`Akun ${field.label} harus unik dan sesuai kategorinya.`);
    result[field.key] = ids;
  }
  if (result.quickAssetIds.some(id => !result.currentAssetIds.includes(id))) throw new Error("Aset cepat harus termasuk pemetaan aset lancar.");
  return result;
}
