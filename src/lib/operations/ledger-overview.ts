import { db } from "../db";
import { reports } from "../accounting";
import { authorizeCompany, allowedBranches, type Actor } from "../auth";
import { object, str } from "./shared";
import { amount, signedCents } from "../money";

/** Company ledger balances and operational documents are different populations. Never add them. */
export async function ledgerOverview(actor: Actor, companyId: string, branchId?: string, periodId?: string) {
  const role = authorizeCompany(actor, companyId, undefined, branchId);
  const eligible = ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"].includes(role) && !allowedBranches(actor, companyId).length && !branchId;
  const empty = { eligible, available: false, period: null as { id: string; name: string } | null, revenue: null as string | null, receivable: null as string | null, advance: null as string | null, journals: 0, historical: false,
    accounts: { receivable: "", advance: "" }, basis: eligible ? "Belum ada buku besar terposting. Sumber impor menunggu verifikasi." : "Saldo perusahaan memerlukan akses keuangan seluruh cabang. Gunakan dokumen dalam cakupan akses Anda." };
  if (!eligible) return empty;
  return db.$transaction(async tx => {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const period = periodId ? await tx.fiscalPeriod.findFirstOrThrow({ where: { id: periodId, companyId } }) : await tx.fiscalPeriod.findFirst({ where: { companyId, entries: { some: { status: "POSTED" } } }, orderBy: { endDate: "desc" } });
    if (!period) return empty;
    const r = await reports(tx, period.id), config = object(object(company.settings).accounting);
    const account = (key: string) => r.rows.find(a => a.id === str(config[key]) && a.category === "ASET");
    const ar = account("receivable"), advance = account("advance");
    const posted = r.entries.length;
    return { ...empty, available: posted > 0, period: { id: period.id, name: period.name }, revenue: posted ? r.revenue : null,
      receivable: posted && ar ? amount(signedCents(ar.net)) : null, advance: posted && advance ? amount(signedCents(advance.net)) : null,
      journals: posted, historical: Boolean(object(company.settings).historicalLedger), accounts: { receivable: ar ? `${ar.code} ${ar.name}` : "Belum dipetakan", advance: advance ? `${advance.code} ${advance.name}` : "Belum dipetakan" },
      basis: `${period.name} · ${posted} jurnal POSTED sebelum penutupan. Dokumen impor tidak dijumlahkan kembali. Aging per invoice dan rekonsiliasi akun kontrol: Accounting → Siklus jasa & CaLK.` };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
