/** Shared form definitions; no database or server imports in the client bundle. */
export const calkSections = [
  ["basis", "Dasar penyusunan dan kebijakan akuntansi"], ["revenue", "Pengakuan pendapatan jasa dan BAST"], ["benefits", "Gaji, lembur, THR, BPJS dan imbalan kerja"],
  ["contracts", "Aset/liabilitas kontrak, uang muka dan unbilled"], ["receivables", "Piutang, penurunan nilai dan risiko kredit"], ["assets", "Chemical, seragam, aset dan penyusutan"], ["commitments", "Komitmen, kontinjensi dan penalti SLA"], ["events", "Peristiwa setelah periode pelaporan"],
] as const;
export type ServicePlanState = {
  version: number; framework: "UNCONFIRMED" | "SAK_EP" | "SAK_EMKM" | "SAK_INDONESIA"; frameworkEvidence: string;
  notes: Record<(typeof calkSections)[number][0], string>;
  budgets: { projectId: string; category: "CHEMICAL" | "LABOR"; amount: string; evidence: string }[];
  cashPlans: { date: string; direction: "IN" | "OUT"; category: "COLLECTION" | "PAYROLL" | "BPJS" | "TAX" | "CHEMICAL" | "OTHER"; projectId: string; amount: string; evidence: string }[];
  allocations: { lineId: string; projectId: string; amount: string; evidence: string }[];
};
export function emptyServicePlan(): ServicePlanState { return { version: 0, framework: "UNCONFIRMED", frameworkEvidence: "", notes: Object.fromEntries(calkSections.map(s => [s[0], ""])) as ServicePlanState["notes"], budgets: [], cashPlans: [], allocations: [] }; }
