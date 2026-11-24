import { Prisma } from "@prisma/client";
import { db } from "./db";
import { reports } from "./accounting";
import { authorizeCompany, allowedBranches, AccessError, type Actor } from "./auth";
import { amount, signedCents } from "./money";
import { object, str } from "./operations/shared";
import { groupOf } from "./management-report";

export type TraceRequest = { company: string; period: string; statement?: string; metric?: string; account?: string; journal?: string; document?: string; page?: number; entryType?: string };
export function requireFinancialScope(actor: Actor, company: string) {
  authorizeCompany(actor, company, ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"]);
  if (allowedBranches(actor, company).length) throw new AccessError("Penelusuran laporan memerlukan akses seluruh perusahaan.");
}
export const safeEvidenceUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
};
const referenceKeys = ["referenceId", "refId", "orderId", "invoiceId", "purchaseId", "requestId", "workOrderId", "sourceRecordId", "advanceId", "shiftRecordId", "closeRecordId"];
const documentFields = ["documentType", "dueDate", "purpose", "projectId", "partnerId", "employeeId", "operation", "warehouseId", "reason", "reviewNote", "attachmentId", ...referenceKeys];
const money = (v: { toString(): string } | string) => v.toString();
export async function financialTrace(actor: Actor, request: TraceRequest) {
  requireFinancialScope(actor, request.company);
  const page = Math.min(100000, Math.max(0, Math.floor(request.page ?? 0))), take = 25;
  return db.$transaction(async tx => {
    const period = await tx.fiscalPeriod.findFirstOrThrow({ where: { id: request.period, companyId: request.company } });
    const company = await tx.company.findUniqueOrThrow({ where: { id: request.company } });
    const base = { company: { id: company.id, name: company.name }, period: { id: period.id, name: period.name }, page, pageSize: take };
    const dtoDocument = (r: Awaited<ReturnType<typeof tx.businessRecord.findMany>>[number] & { lines?: { description: string; quantity: { toString(): string }; unitPrice: { toString(): string }; total: { toString(): string } }[] }) => ({
      id: r.id, number: r.number, module: r.module, title: r.title, date: r.date.toISOString().slice(0, 10), status: r.status,
      amount: money(r.amount), settled: money(r.settled), journalId: r.journalId, sourceFileId: r.sourceFileId, sourceRow: r.sourceRow,
      fields: Object.fromEntries(documentFields.filter(k => object(r.data)[k] !== undefined).map(k => [k, object(r.data)[k]])),
      lines: r.lines?.map(l => ({ description: l.description, quantity: money(l.quantity), unitPrice: money(l.unitPrice), total: money(l.total) })) ?? [],
    });
    if (request.document) {
      const record = await tx.businessRecord.findFirstOrThrow({ where: { companyId: company.id, id: request.document }, include: { lines: true } });
      const data = object(record.data), ids = referenceKeys.map(k => str(data[k])).filter(Boolean);
      const related = await tx.businessRecord.findMany({ where: { companyId: company.id, id: { not: record.id }, OR: [
        { id: { in: ids } }, ...referenceKeys.map(k => ({ data: { path: [k], equals: record.id } })),
      ] }, take: 51, orderBy: { date: "desc" } });
      const source = record.sourceFileId ? await tx.sourceFile.findFirst({ where: { companyId: company.id, id: record.sourceFileId }, select: { id: true, name: true, url: true } }) : null;
      const attachmentId = str(data.attachmentId), attachment = attachmentId ? await tx.attachment.findFirst({ where: { companyId: company.id, id: attachmentId }, select: { id: true, name: true } }) : null;
      const masterIds = ["projectId", "partnerId", "employeeId", "warehouseId"].map(k => str(data[k])).filter(Boolean);
      const masters = await tx.masterRecord.findMany({ where: { companyId: company.id, id: { in: masterIds } }, select: { id: true, code: true, name: true } });
      const journal = record.journalId ? await tx.journalEntry.findFirst({ where: { companyId: company.id, id: record.journalId }, select: { id: true, fiscalPeriodId: true, journalNumber: true } }) : null;
      return { ...base, level: "DOCUMENT" as const, title: record.number, record: dtoDocument(record), masters, journal, related: related.slice(0, 50).map(dtoDocument), relatedTruncated: related.length > 50,
        source: source ? { ...source, url: safeEvidenceUrl(source.url), row: record.sourceRow } : null, attachment,
        sourceNote: source || attachment ? null : "Bukti digital belum ditautkan pada dokumen ini. Relasi tidak dibuat dari kesamaan nama atau nominal." };
    }
    const r = await reports(tx, period.id);
    const mapRows = await tx.$queryRaw<{ code: string; g: string | null }[]>(Prisma.sql`SELECT DISTINCT data->>'accountCode' AS code, data->>'16' AS g FROM source_facts WHERE "companyId"=${company.id} AND kind='FINANCIAL_JOURNAL'`);
    const mapping = new Map(mapRows.filter(x => x.code && x.g).map(x => [x.code, String(x.g)]));
    const statement = request.statement ?? "BALANCE", metric = request.metric ?? "assets";
    if (request.entryType && !["OPENING", "GENERAL", "ADJUSTING", "REVERSING"].includes(request.entryType)) throw new Error("Filter jenis jurnal tidak valid.");
    const config = object(object(company.settings).accounting), drawingsIds = Array.isArray(config.drawingsIds) ? config.drawingsIds.map(String) : [];
    const isDrawing = (a: typeof r.rows[number]) => a.role === "DRAWINGS" || drawingsIds.includes(a.id);
    let sign = 1n;
    let rows: typeof r.rows = [];
    if (statement === "BALANCE") {
      if (metric === "assets") rows = r.rows.filter(a => a.category === "ASET");
      else if (metric === "liabilities") { rows = r.rows.filter(a => a.category === "KEWAJIBAN"); sign = -1n; }
      else if (metric === "equity") { rows = r.rows.filter(a => ["EKUITAS", "PENDAPATAN", "BEBAN"].includes(a.category)); sign = -1n; }
      else throw new Error("Pos neraca tidak dikenal.");
    } else if (statement === "PROFIT_LOSS") {
      if (metric === "revenue") { rows = r.rows.filter(a => a.category === "PENDAPATAN"); sign = -1n; }
      else if (metric === "expense") rows = r.rows.filter(a => a.category === "BEBAN");
      else if (metric === "profit") { rows = r.rows.filter(a => ["PENDAPATAN", "BEBAN"].includes(a.category)); sign = -1n; }
      else if (["PENDAPATAN", "HPP", "BEBAN", "LAIN", "PAJAK", "grossProfit", "operatingProfit", "preTax"].includes(metric)) {
        const groups = metric === "grossProfit" ? ["PENDAPATAN", "HPP"] : metric === "operatingProfit" ? ["PENDAPATAN", "HPP", "BEBAN"] : metric === "preTax" ? ["PENDAPATAN", "HPP", "BEBAN", "LAIN"] : [metric];
        rows = r.rows.filter(a => groups.includes(groupOf(a.code, a.category, mapping) ?? ""));
        sign = ["HPP", "BEBAN", "PAJAK"].includes(metric) ? 1n : -1n;
      } else throw new Error("Pos laba rugi tidak dikenal.");
    } else if (statement === "EQUITY") {
      if (metric === "capitalBefore") { rows = r.rows.filter(a => a.category === "EKUITAS" && !isDrawing(a)); sign = -1n; }
      else if (metric === "drawings") rows = r.rows.filter(isDrawing);
      else if (metric === "profit") { rows = r.rows.filter(a => ["PENDAPATAN", "BEBAN"].includes(a.category)); sign = -1n; }
      else if (metric === "equity") { rows = r.rows.filter(a => ["EKUITAS", "PENDAPATAN", "BEBAN"].includes(a.category)); sign = -1n; }
      else throw new Error("Pos ekuitas tidak dikenal.");
    } else if (statement === "CASH_FLOW") {
      if (!["opening", "operating", "investing", "financing", "ending", "difference"].includes(metric)) throw new Error("Pos arus kas tidak dikenal.");
      rows = r.rows.filter(a => a.isCash);
    } else if (statement === "JOURNAL") rows = r.rows;
    else throw new Error("Jenis laporan tidak dikenal.");
    if (request.account) {
      if (!rows.some(a => a.id === request.account)) throw new AccessError("Akun di luar pos laporan ini.", 404);
      rows = rows.filter(a => a.id === request.account);
    }
    const accountIds = new Set(rows.map(a => a.id));
    const acceptEntry = (e: typeof r.entries[number]) => statement !== "CASH_FLOW" || metric === "ending" || (metric === "opening" ? e.type === "OPENING" : metric === "difference" ? e.type !== "OPENING" && !e.cashActivity : e.type !== "OPENING" && e.cashActivity === metric.toUpperCase());
    let entries = r.entries.filter(e => (!request.entryType || e.type === request.entryType) && acceptEntry(e));
    if (request.journal) {
      const entry = await tx.journalEntry.findFirstOrThrow({ where: { id: request.journal, companyId: company.id, fiscalPeriodId: period.id }, include: { lines: { include: { account: true } }, attachment: true } });
      if (statement !== "JOURNAL" && !entries.some(e => e.id === entry.id)) throw new AccessError("Jurnal di luar pos laporan.", 404);
      entries = [entry];
    }
    const values = new Map<string, bigint>();
    for (const e of entries) for (const l of e.lines) if (accountIds.has(l.accountId)) values.set(l.accountId, (values.get(l.accountId) ?? 0n) + (signedCents(l.debit) - signedCents(l.credit)) * sign);
    const accounts = rows.map(a => ({ id: a.id, code: a.code, name: a.name, category: a.category, value: amount(values.get(a.id) ?? 0n) })).filter(a => signedCents(a.value) !== 0n || request.account);
    const matching = entries.filter(e => e.lines.some(l => accountIds.has(l.accountId))).toReversed();
    const selected = request.journal ? matching : matching.slice(page * take, (page + 1) * take);
    const journalIds = selected.map(e => e.id);
    const [facts, documents] = await Promise.all([
      journalIds.length ? tx.sourceFact.findMany({ where: { companyId: company.id, kind: "FINANCIAL_JOURNAL", OR: journalIds.map(id => ({ data: { path: ["ledger", "journalId"], equals: id } })) }, select: { id: true, sheet: true, row: true, sourceFileId: true, documentNumber: true, data: true, debit: true, credit: true } }) : [],
      tx.businessRecord.findMany({ where: { companyId: company.id, journalId: { in: journalIds } }, include: { lines: true } }),
    ]);
    const referenceNumbers = [...new Set(facts.map(f => str(object(f.data)["4"])).filter(Boolean))];
    const sourceDocuments = referenceNumbers.length ? await tx.sourceFact.findMany({ where: { companyId: company.id, kind: "FINANCIAL_SOURCE", documentNumber: { in: referenceNumbers } }, select: { id: true, sourceFileId: true, sheet: true, row: true, documentNumber: true, effectiveDate: true, amount: true } }) : [];
    const files = await tx.sourceFile.findMany({ where: { companyId: company.id, id: { in: [...new Set([...facts, ...sourceDocuments].map(f => f.sourceFileId))] } }, select: { id: true, name: true, url: true } });
    const sourceFile = (id: string) => { const f = files.find(x => x.id === id); return f ? { ...f, url: safeEvidenceUrl(f.url) } : null; };
    const journals = selected.map(e => {
      const linked = facts.filter(f => str(object(object(f.data).ledger).journalId) === e.id);
      const refs = new Set(linked.map(f => str(object(f.data)["4"])).filter(Boolean));
      const sourceRefs = sourceDocuments.filter(f => refs.has(f.documentNumber ?? ""));
      return { id: e.id, number: e.journalNumber, description: e.description, date: e.transactionDate.toISOString().slice(0, 10), status: e.status, type: e.type,
        debit: amount(e.lines.reduce((s, l) => s + signedCents(l.debit), 0n)), credit: amount(e.lines.reduce((s, l) => s + signedCents(l.credit), 0n)),
        contribution: amount(e.lines.filter(l => accountIds.has(l.accountId)).reduce((s, l) => s + (signedCents(l.debit) - signedCents(l.credit)) * sign, 0n)),
        lines: request.journal ? e.lines.map(l => ({ id: l.id, accountId: l.accountId, code: l.account.code, name: l.account.name, description: l.description, debit: money(l.debit), credit: money(l.credit) })) : [],
        reportLinks: e.status === "POSTED" && e.type !== "CLOSING" ? [
          ...(e.lines.some(l => l.account.category === "ASET") ? [{ statement: "BALANCE", metric: "assets", label: "Neraca · aset" }] : []),
          ...(e.lines.some(l => l.account.category === "KEWAJIBAN") ? [{ statement: "BALANCE", metric: "liabilities", label: "Neraca · liabilitas" }] : []),
          ...(e.lines.some(l => ["EKUITAS", "PENDAPATAN", "BEBAN"].includes(l.account.category)) ? [{ statement: "BALANCE", metric: "equity", label: "Neraca · ekuitas" }] : []),
          ...(e.lines.some(l => ["PENDAPATAN", "BEBAN"].includes(l.account.category)) ? [{ statement: "PROFIT_LOSS", metric: "profit", label: "Laba rugi · laba bersih" }] : []),
          ...(e.lines.some(l => l.account.isCash) ? [{ statement: "CASH_FLOW", metric: e.type === "OPENING" ? "opening" : e.cashActivity?.toLowerCase() ?? "difference", label: "Arus kas terkait" }] : []),
        ] : [],
        attachment: e.attachment?.companyId === company.id ? { id: e.attachment.id, name: e.attachment.name } : null,
        sources: linked.map(f => ({ id: f.id, sheet: f.sheet, row: f.row, reference: str(object(f.data)["4"]), debit: f.debit?.toString() ?? null, credit: f.credit?.toString() ?? null, file: sourceFile(f.sourceFileId) })),
        sourceDocuments: sourceRefs.map(f => ({ ...f, amount: f.amount?.toString() ?? null, effectiveDate: f.effectiveDate?.toISOString().slice(0, 10) ?? null, file: sourceFile(f.sourceFileId), match: sourceRefs.filter(x => x.documentNumber === f.documentNumber).length === 1 ? "REFERENSI_TEPAT" : "NOMOR_SAMA_PERLU_VERIFIKASI" })),
        documents: documents.filter(d => d.journalId === e.id).map(dtoDocument),
        evidenceUrls: [...new Set((e.description.match(/https:\/\/[^\s<>"']+/g) ?? []).map(safeEvidenceUrl).filter((v): v is string => Boolean(v)))],
        sourceNote: !linked.length && !documents.some(d => d.journalId === e.id) && !e.attachmentId ? "Bukti sumber belum ditautkan secara terstruktur. Rujukan uraian perlu diperiksa." : null,
      };
    });
    return { ...base, level: request.journal ? "JOURNAL" as const : request.account ? "ACCOUNT" as const : "STATEMENT" as const,
      statement, metric, title: request.journal ? journals[0]?.number ?? "Jurnal" : request.account ? accounts[0]?.name ?? "Akun" : "Penelusuran laporan",
      value: amount([...values.values()].reduce((s, v) => s + v, 0n)), accounts, journals, total: matching.length,
      basis: `Jurnal POSTED sebelum penutupan${request.entryType ? `; jenis ${request.entryType}` : ""}; sumber dan dokumen mengikuti tautan eksplisit. Jurnal detail non-POSTED tidak dihitung ke laporan.`,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
