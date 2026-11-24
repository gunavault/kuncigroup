import { bankBalanceCheck } from "./bank-reconciliation";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { reports } from "./accounting";
import { signedCents, amount } from "./money";
import { assignedRole, type Actor } from "./auth";
import { historicalWindow } from "./working-paper-ledger";
import { createHash } from "node:crypto";
import { authorizeCompany, allowedBranches, AccessError } from "./auth";

/**
 * Report finalisation for periods carrying working-paper findings.
 * A period's reports become FINAL only when every condition below is proven by data,
 * and two different people (Finance, then Director/Administrator) have signed off.
 * Nothing is marked resolved automatically.
 */
export const FINDING_STATUS = ["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED_RISK"] as const;
type FindingStatus = (typeof FINDING_STATUS)[number];
type Resolution = { status: FindingStatus; note: string; evidence?: string; attachmentId?: string; by: string; name: string; at: string };
type SignOff = { role: "FINANCE" | "DIRECTOR"; by: string; name: string; at: string; note: string; ledgerFingerprint?: string };
type Store = Record<string, { findings?: Record<string, Resolution>; signoffs?: SignOff[]; decision?: { by: string; name: string; at: string; reason: string }; exception?: { by: string; name: string; reason: string; at: string } }>;
const KEY = "_finalization";
export function finalizationPermissions(actor: Actor, companyId: string) {
  const role = assignedRole(actor, companyId);
  return { actorId: actor.id, finance: actor.superuser || ["ADMIN", "FINANCE"].includes(role), director: actor.superuser || ["ADMIN", "DIRECTOR"].includes(role), admin: actor.superuser || role === "ADMIN" };
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
async function load(tx: Prisma.TransactionClient, companyId: string): Promise<Store> {
  const s = await tx.moduleSetting.findUnique({ where: { companyId_key: { companyId, key: KEY } } });
  return obj(s?.settings) as Store;
}
async function save(tx: Prisma.TransactionClient, companyId: string, store: Store) {
  await tx.moduleSetting.upsert({
    where: { companyId_key: { companyId, key: KEY } },
    create: { companyId, key: KEY, enabled: true, settings: store as Prisma.InputJsonValue },
    update: { settings: store as Prisma.InputJsonValue },
  });
}
const cell = (d: unknown, k: string) => String(obj(obj(d).cells)[k] ?? "");

export async function finalizationStatus(companyId: string, periodId: string, tx: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient) {
  const period = await tx.fiscalPeriod.findFirstOrThrow({ where: { id: periodId, companyId } });
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const history = historicalWindow(company.settings);
  const applies = history?.periodId === period.id;
  const r = await reports(tx, period.id);
  const store = (await load(tx, companyId))[period.id] ?? {};
  const control = applies
    ? await tx.sourceFact.findMany({ where: { companyId, kind: "CONTROL", sheet: "TEMUAN" }, orderBy: { row: "asc" }, select: { data: true } })
    : [];
  const findings = control.filter((c) => cell(c.data, "1")).map((c) => {
    const code = cell(c.data, "1");
    const res = store.findings?.[code];
    return { code, issue: cell(c.data, "2"), severity: cell(c.data, "4"), owner: cell(c.data, "7"), due: cell(c.data, "8"), status: (res?.status ?? "OPEN") as FindingStatus, resolution: res ?? null };
  });
  const nonZero = (pred: (x: (typeof r.rows)[number]) => boolean) =>
    r.rows.filter((x) => pred(x) && signedCents(x.net) !== 0n).map((x) => ({ code: x.code, name: x.name, balance: amount(signedCents(x.net)) }));
  const estimates = nonZero((x) => /estimasi/i.test(x.name));
  const suspense = nonZero((x) => x.code.startsWith("999"));
  const drafts = await tx.journalEntry.count({ where: { fiscalPeriodId: period.id, status: "DRAFT" } });
  const openHigh = findings.filter((f) => f.severity === "T" && !["RESOLVED", "ACCEPTED_RISK"].includes(f.status));
  const ledgerFingerprint = createHash("sha256").update(JSON.stringify({ accounting: obj(company.settings).accounting, entries: r.entries.map(e => e.id).sort(), rows: r.rows.map(a => [a.id, a.code, a.name, a.category, a.net, a.isCash, a.role, a.normalBalance]) })).digest("hex");
  const signoffs = (store.signoffs ?? []).filter(s => s.ledgerFingerprint === ledgerFingerprint);
  const staleSignoffs = (store.signoffs ?? []).length - signoffs.length;
  const finance = signoffs.find((s) => s.role === "FINANCE"), director = signoffs.find((s) => s.role === "DIRECTOR");
  const bank = applies ? await bankBalanceCheck(tx, companyId, period.endDate, r.rows) : { ok: true, detail: "Tidak berlaku" };
  const checks = [
    { key: "balanced", label: "Neraca saldo, neraca dan arus kas seimbang", ok: r.trialDebit === r.trialCredit && signedCents(r.balanceDifference) === 0n && signedCents(r.cash.difference) === 0n, detail: `Selisih neraca ${r.balanceDifference}; selisih arus kas ${r.cash.difference}` },
    { key: "drafts", label: "Tidak ada jurnal draft", ok: drafts === 0, detail: `${drafts} draft` },
    { key: "estimates", label: "Akun estimasi sudah diganti angka aktual (saldo nol)", ok: estimates.length === 0, detail: estimates.map((e) => `${e.code} ${e.balance}`).join("; ") || "Nihil" },
    { key: "suspense", label: "Akun penampung sudah direklasifikasi (saldo nol)", ok: suspense.length === 0, detail: suspense.map((e) => `${e.code} ${e.balance}`).join("; ") || "Nihil" },
    { key: "bank", label: "Rekening bank direkonsiliasi ke rekening koran s.d. akhir periode", ok: bank.ok, detail: bank.detail },
    { key: "findings", label: "Temuan tingkat T selesai atau risikonya diterima Direksi", ok: openHigh.length === 0, detail: openHigh.length ? `${openHigh.length} terbuka: ${openHigh.map((f) => f.code).join(", ")}` : "Selesai" },
    { key: "finance", label: "Sign-off Finance", ok: Boolean(finance), detail: finance ? `${finance.name}, ${finance.at.slice(0, 10)}` : "Belum" },
    { key: "director", label: "Persetujuan Direksi (orang berbeda dari Finance)", ok: Boolean(director), detail: director ? `${director.name}, ${director.at.slice(0, 10)}` : "Belum" },
    { key: "closed", label: "Periode ditutup", ok: period.status === "CLOSED", detail: period.status },
  ];
  const substantive = checks.filter((c) => !["finance", "director", "closed"].includes(c.key));
  const accepted = findings.some((f) => f.status === "ACCEPTED_RISK") || Boolean(store.exception);
  const state = !applies
    ? period.status === "CLOSED" ? "FINAL" : "DRAFT"
    : checks.every((c) => c.ok) ? (accepted ? "FINAL_WITH_EXCEPTIONS" : "FINAL")
    : store.exception && period.status === "CLOSED" && finance && director ? "FINAL_WITH_EXCEPTIONS"
    : "DRAFT";
  return {
    applies, period: { id: period.id, name: period.name, status: period.status }, state, checks,
    readyForSignOff: substantive.every((c) => c.ok) || Boolean(store.exception),
    blockersForClose: applies ? checks.filter((c) => c.key !== "closed" && !c.ok).map((c) => c.label) : [],
    findings, signoffs, staleSignoffs, ledgerFingerprint, decision: store.decision ?? null, exception: store.exception ?? null,
  };
}

export async function updateFinalization(actor: Actor, companyId: string, input: unknown) {
  authorizeCompany(actor, companyId, ["ADMIN", "FINANCE", "MANAGER", "AUDITOR"]);
  if (allowedBranches(actor, companyId).length) throw new AccessError("Finalisasi memerlukan akses seluruh perusahaan.");
  const d = obj(input), action = String(d.action ?? ""), periodId = String(d.periodId ?? "");
  const role = assignedRole(actor, companyId);
  const isFinance = actor.superuser || ["ADMIN", "FINANCE"].includes(role);
  const isDirector = actor.superuser || ["ADMIN", "DIRECTOR"].includes(role);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM fiscal_periods WHERE id=${periodId} AND company_id=${companyId} FOR UPDATE`;
    const status = await finalizationStatus(companyId, periodId, tx);
    if (!status.applies) throw new Error("Periode ini tidak memerlukan finalisasi temuan.");
    if (status.period.status === "CLOSED") throw new Error("Periode sudah ditutup; finalisasi terkunci.");
    const store = await load(tx, companyId);
    const p = (store[periodId] ??= {});
    const stamp = { by: actor.id, name: actor.name, at: new Date().toISOString() };
    const note = String(d.note ?? "").trim();
    if (action === "finding") {
      const code = String(d.code ?? ""), next = String(d.status ?? "") as FindingStatus;
      const finding = status.findings.find((f) => f.code === code);
      if (!finding) throw new Error("Kode temuan tidak dikenal.");
      if (!FINDING_STATUS.includes(next)) throw new Error("Status temuan tidak valid.");
      if (next !== "ACCEPTED_RISK" && !isFinance) throw new Error("Pembaruan temuan memerlukan Finance atau Administrator.");
      if (next === "ACCEPTED_RISK" && !isDirector) throw new Error("Penerimaan risiko hanya oleh Direksi/Administrator.");
      if (["RESOLVED", "ACCEPTED_RISK"].includes(next) && note.length < 20) throw new Error("Catatan penyelesaian minimal 20 karakter.");
      const evidence = String(d.evidence ?? "").trim(), attachmentId = String(d.attachmentId ?? "").trim();
      if (next === "RESOLVED" && finding.severity === "T" && !evidence && !attachmentId)
        throw new Error("Temuan tingkat T wajib menyertakan bukti (lampiran atau rujukan dokumen).");
      if (attachmentId && !(await tx.attachment.count({ where: { id: attachmentId, companyId } }))) throw new Error("Lampiran bukti tidak ditemukan.");
      p.findings = { ...(p.findings ?? {}), [code]: { status: next, note, ...(evidence ? { evidence } : {}), ...(attachmentId ? { attachmentId } : {}), ...stamp } };
      p.signoffs = []; // any change invalidates earlier sign-offs
    } else if (action === "signoff") {
      const as = String(d.role ?? "") as SignOff["role"];
      if (!status.readyForSignOff) throw new Error("Daftar periksa substantif belum lulus; sign-off belum dapat dilakukan.");
      if (note.length < 10) throw new Error("Catatan sign-off minimal 10 karakter.");
      if (as === "FINANCE" && !(actor.superuser || role === "FINANCE" || role === "ADMIN")) throw new Error("Sign-off Finance memerlukan peran Finance.");
      if (as === "DIRECTOR" && !isDirector) throw new Error("Persetujuan memerlukan Direktur atau Administrator.");
      if (!["FINANCE", "DIRECTOR"].includes(as)) throw new Error("Jenis sign-off tidak valid.");
      const existing = status.signoffs;
      if (as === "DIRECTOR" && !existing.some((s) => s.role === "FINANCE")) throw new Error("Persetujuan Direksi dilakukan setelah sign-off Finance.");
      if (existing.some((s) => s.by === actor.id)) throw new Error("Sign-off Finance dan persetujuan Direksi harus oleh orang berbeda.");
      p.signoffs = [...existing.filter((s) => s.role !== as), { role: as, note, ...stamp, ledgerFingerprint: status.ledgerFingerprint }];
      delete p.decision;
    } else if (action === "exception") {
      if (!isDirector) throw new Error("Pengecualian hanya oleh Direksi/Administrator.");
      if (note.length < 30) throw new Error("Alasan pengecualian minimal 30 karakter.");
      p.exception = { reason: note, by: stamp.by, name: stamp.name, at: stamp.at };
      p.signoffs = [];
    } else if (action === "withdrawSignoff") {
      if (note.length < 10) throw new Error("Alasan penarikan minimal 10 karakter.");
      const as = String(d.role), previous = (p.signoffs ?? []).find(s => s.role === as);
      if (!previous) throw new Error("Sign-off tidak ditemukan.");
      if (previous.by !== actor.id && !(actor.superuser || role === "ADMIN")) throw new AccessError("Hanya penandatangan atau Administrator dapat menarik sign-off.");
      p.signoffs = as === "FINANCE" ? [] : (p.signoffs ?? []).filter(s => s.role !== "DIRECTOR");
      p.decision = { ...stamp, reason: note };
    } else if (action === "reject") {
      if (!isDirector) throw new AccessError("Penolakan laporan memerlukan Direksi atau Administrator.");
      const finance = status.signoffs.find(s => s.role === "FINANCE");
      if (!finance || finance.by === actor.id) throw new Error("Penolakan dilakukan orang berbeda setelah sign-off Finance yang masih berlaku.");
      if (note.length < 10) throw new Error("Alasan penolakan minimal 10 karakter.");
      p.signoffs = [];
      p.decision = { ...stamp, reason: note };
    } else if (action === "revokeException") {
      if (!isDirector) throw new AccessError("Pencabutan pengecualian memerlukan Direksi atau Administrator.");
      if (!p.exception) throw new Error("Belum ada pengecualian.");
      if (note.length < 10) throw new Error("Alasan pencabutan minimal 10 karakter.");
      delete p.exception;
      p.signoffs = [];
      p.decision = { ...stamp, reason: note };
    } else throw new Error("Aksi finalisasi tidak dikenal.");
    await save(tx, companyId, store);
    await tx.auditEvent.create({ data: { companyId, actorId: actor.id, action: `FINALIZATION_${action.toUpperCase()}`, entityId: periodId, details: { code: d.code ?? null, status: d.status ?? null, role: d.role ?? null, reason: note } as Prisma.InputJsonValue } });
    return finalizationStatus(companyId, periodId, tx);
  }, { timeout: 60000 });
}

/** Called before closing a period: refuses unless the checklist passes or an exception is recorded. */
export async function assertCloseAllowed(periodId: string, tx: Prisma.TransactionClient = db as unknown as Prisma.TransactionClient) {
  const period = await tx.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const s = await finalizationStatus(period.companyId, periodId, tx);
  if (!s.applies) return;
  if (s.exception && s.signoffs.some((x) => x.role === "FINANCE") && s.signoffs.some((x) => x.role === "DIRECTOR")) return;
  if (s.blockersForClose.length)
    throw new Error(`Periode belum dapat ditutup: ${s.blockersForClose.join("; ")}. Selesaikan, atau catat pengecualian Direksi lalu lakukan sign-off.`);
}
