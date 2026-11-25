export const ratioMappingFields = [
  { key: "currentAssetIds", label: "Aset lancar", category: "ASET" },
  { key: "currentLiabilityIds", label: "Liabilitas lancar", category: "KEWAJIBAN" },
  { key: "quickAssetIds", label: "Aset cepat (kas, investasi likuid, piutang)", category: "ASET" },
  { key: "interestBearingDebtIds", label: "Pinjaman berbunga", category: "KEWAJIBAN" },
  { key: "inventoryIds", label: "Persediaan untuk perputaran / DIO", category: "ASET" },
  { key: "receivableIds", label: "Piutang usaha untuk DSO", category: "ASET" },
  { key: "creditSalesRevenueIds", label: "Pendapatan khusus penjualan kredit (neto)", category: "PENDAPATAN" },
  { key: "interestExpenseIds", label: "Beban bunga untuk interest coverage", category: "BEBAN" },
  { key: "laborExpenseIds", label: "Biaya tenaga kerja (gaji, lembur, THR, BPJS)", category: "BEBAN" },
  { key: "chemicalExpenseIds", label: "Beban pemakaian chemical / perlengkapan", category: "BEBAN" },
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

/**
 * Automatic mapping proposal from the chart of accounts (code ranges and account names).
 * Rules, so Finance can review every choice:
 * - current assets: ASET 111–113 (cash, receivables, inventory, prepaid, taxes, deposits); deferred tax, 114 and 999 excluded;
 * - current liabilities: every KEWAJIBAN 21x (the COA has no long-term range); 999 suspense excluded;
 * - quick assets: cash/bank accounts and receivables only (no inventory, prepaid, tax assets or related-party loans);
 * - interest-bearing debt: liabilities named pinjaman / pembiayaan / bank / leasing / kredit;
 * - inventory: "persediaan"; trade receivables: "piutang usaha/dagang";
 * - credit sales: operating revenue 4xxxx except returns (invoice-based B2B contracts);
 * - interest expense: BEBAN named "bunga" except tax on interest income.
 */
export function suggestRatioMapping(accounts: { id: string; code: string; name: string; category: string; isCash: boolean; active?: boolean }[]) {
  const live = accounts.filter((a) => a.active !== false && !a.code.startsWith("999"));
  const pick = (f: (a: (typeof live)[number]) => boolean) => live.filter(f).map((a) => a.id);
  const current = (a: (typeof live)[number]) => a.category === "ASET" && /^11[123]/.test(a.code) && !/tangguhan/i.test(a.name);
  const mapping: Record<(typeof ratioMappingFields)[number]["key"], string[]> = {
    currentAssetIds: pick(current),
    currentLiabilityIds: pick((a) => a.category === "KEWAJIBAN" && a.code.startsWith("21")),
    quickAssetIds: pick((a) => current(a) && (a.isCash || /piutang|cash advance/i.test(a.name)) && !/persediaan|dimuka|di muka|pajak|ppn|pph/i.test(a.name)),
    interestBearingDebtIds: pick((a) => a.category === "KEWAJIBAN" && /pinjaman|pembiayaan|bank|leasing|kredit/i.test(a.name)),
    inventoryIds: pick((a) => a.category === "ASET" && /persediaan/i.test(a.name)),
    receivableIds: pick((a) => a.category === "ASET" && /piutang (usaha|dagang)/i.test(a.name)),
    creditSalesRevenueIds: [], // The account name/range does not prove that all sales are on credit.
    interestExpenseIds: pick((a) => a.category === "BEBAN" && /bunga/i.test(a.name) && !/pajak/i.test(a.name)),
    laborExpenseIds: [],
    chemicalExpenseIds: [],
  };
  return validateRatioMapping(mapping, accounts);
}
