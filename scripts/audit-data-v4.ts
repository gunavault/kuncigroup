/** Produces only requested audit findings and aggregates; no raw production snapshot or login data. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { definitions, masterDefinitions, modules } from "../src/lib/operations/registry";

type Row = Record<string, any>;
const input = JSON.parse(readFileSync(process.argv[2] ?? "data/audit-v4/production.json", "utf8"));
const bundle = JSON.parse(readFileSync(process.argv[3] ?? "data/upload-audit/import-v3.json", "utf8"));
const output = process.argv[4] ?? "data/audit-v4/report-data.json";
const blank = (v: unknown) => v === null || v === undefined || typeof v === "string" && !v.trim();
const decimal = (v: unknown, precision = 2): bigint => {
  const text = String(v ?? "0"); if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error("Invalid decimal in audit");
  const sign = text.startsWith("-") ? -1n : 1n, [a, b = ""] = text.replace("-", "").split(".");
  // Source Excel caches may contain sub-cent floating tails; use the database's
  // half-up decimal precision without turning a missing value into a real zero.
  return sign * (BigInt(a) * 10n ** BigInt(precision) + BigInt(b.slice(0, precision).padEnd(precision, "0")) + (Number(b[precision] ?? "0") >= 5 ? 1n : 0n));
};
const num = (v: bigint, precision = 2) => Number(v) / 10 ** precision;
const masters: Row[] = input.masters, records: Row[] = input.records, facts: Row[] = input.facts;
const company = (id: string) => input.companies.find((c: Row) => c.id === id)?.code ?? id;
const branch = (id: string) => input.branches.find((c: Row) => c.id === id)?.code ?? "PERUSAHAAN";
const masterGaps: Row[] = [], transactionGaps: Row[] = [], sourceIssues: Row[] = [], reconciliations: Row[] = [], nominalDifferences: Row[] = [];
function gap(list: Row[], scope: string, key: string, kind: string, companyId: string, code: string, field: string, rule: string, priority: string, owner: string, action: string, source = "") {
  list.push({ scope, recordKey: key, company: company(companyId), kind, code, field, rule, priority, owner, action, source, status: "TERBUKA", assignee: "", targetDate: "", resolution: "" });
}
function check(name: string, population: number, failed: number, detail: string, lhs: number | null = null, rhs: number | null = null, unit = "baris") {
  reconciliations.push({ name, population, failed, lhs, rhs, difference: lhs === null || rhs === null ? null : Math.round((lhs - rhs) * 100) / 100, unit, status: failed ? "PERLU TINJAUAN" : "SESUAI", detail });
}
for (const m of masters) {
  if (input.companies.find((c: Row) => c.id === m.companyId)?.isDemo) continue;
  const data = m.data ?? {}, def = masterDefinitions[m.kind];
  const code = m.kind === "EMPLOYEE" ? String(data.workId || m.code) : m.code;
  const source = m.sourceFileId ? `${input.sources.find((s: Row) => s.id === m.sourceFileId)?.name ?? m.sourceFileId} / ${m.sourceRow ?? ""}` : Array.isArray(data.sourceReferences) && data.sourceReferences.length ? data.sourceReferences.map((r: Row) => `${input.sources.find((s: Row) => s.id === r.file)?.name ?? r.file} / ${r.sheet ?? ""}${r.row ? "!" + r.row : ""}${r.page ? " hlm. " + r.page : ""}`).join(" | ") : "Database ERP";
  const owner = ["EMPLOYEE", "DEPARTMENT", "POSITION"].includes(m.kind) ? "HR" : ["ASSET", "WAREHOUSE", "PRODUCT"].includes(m.kind) ? "Operasional / Logistik" : "Finance / Komersial";
  const missing = new Set<string>();
  function add(field: string, label: string, rule: string, priority: string, action: string) {
    if (!blank(data[field]) || missing.has(field)) return; missing.add(field);
    gap(masterGaps, "MASTER", m.id, m.kind, m.companyId, code, label, rule, priority, owner, action, source);
  }
  for (const f of def?.fields ?? []) if (f.required) add(f.key, f.label, "WAJIB FORMULIR", "TINGGI", `Lengkapi ${f.label} dari bukti sumber, lalu verifikasi master.`);
  if (m.kind === "EMPLOYEE") {
    if (data.currentRoster) {
      for (const [field, label] of [["workId", "ID karyawan"], ["departmentId", "Relasi departemen"], ["positionId", "Relasi jabatan"], ["projectId", "Relasi proyek"], ["joinedAt", "Tanggal bergabung"]]) add(field, label, "KELENGKAPAN ROSTER", field === "workId" ? "TINGGI" : "SEDANG", `Konfirmasi ${label} kepada HR. Jangan menebak dari nama atau absensi.`);
      if (m.active) add("userId", "Relasi akun pengguna", "AKTIVASI LAYANAN MANDIRI", "SEDANG", "Tetapkan atasan, peran dan cabang, lalu buat akun individual jika personel memerlukan akses.");
      add("employmentStatus", "Status hubungan kerja", "KELENGKAPAN ROSTER", "SEDANG", "Konfirmasi status dari dokumen hubungan kerja. Tanggal kontrak dilengkapi sesuai status, bukan ditebak dari jabatan.");
    }
  }
  if (m.kind === "ASSET") {
    add("assetScope", "Ruang lingkup HO / proyek", "PEMETAAN ASET", "SEDANG", "Konfirmasi dari register sumber atau penanggung jawab. Jangan menebak dari nama aset.");
    add("fiscalGroup", "Kelompok fiskal bila aset disusutkan", "KEPUTUSAN FINANCE", "SEDANG", "Finance menentukan kapitalisasi dan kelompok fiskal jika objek memang disusutkan; catat alasan bila tidak berlaku.");
    for (const [field, label] of [["cost", "Harga perolehan"], ["acquiredAt", "Tanggal perolehan"], ["quantity", "Jumlah unit"], ["condition", "Kondisi"], ["custodian", "Pemegang aset"]]) add(field, label, "BUKTI REGISTER ASET", ["cost", "acquiredAt"].includes(field) ? "TINGGI" : "SEDANG", "Cocokkan register fisik, faktur dan berita acara. Kelompok aset tidak dipecah tanpa bukti.");
    if (data.identityReview) gap(masterGaps, "MASTER", m.id, m.kind, m.companyId, code, "Kode aset sumber", "KODE SEMENTARA", "TINGGI", owner, "Tetapkan identitas aset dari pemeriksaan fisik. Kode lokal bukan kode asli sumber.", source);
  }
  if (m.kind === "PRODUCT" && data.type === "STOCK") {
    add("barcode", "Barcode produk", "PERSIAPAN PEMINDAIAN", "SEDANG", "Tetapkan barcode unik setelah identitas produk disetujui.");
    add("cost", "Biaya unit terverifikasi", "PERSIAPAN VALUASI", "TINGGI", "Gunakan faktur atau saldo awal terverifikasi. Harga RAB dan sewa bukan biaya stok aktual.");
  }
  if (m.kind === "PROJECT" && m.active) for (const [field, label] of [["partnerId", "Relasi pelanggan"], ["startAt", "Tanggal awal kontrak"], ["dueDate", "Tanggal akhir kontrak"], ["contractValue", "Nilai kontrak"], ["slaTarget", "Target SLA"]]) add(field, label, "PERSIAPAN KONTRAK / SLA", "SEDANG", "Lengkapi dari kontrak dan addendum yang berlaku.");
  if (m.kind === "WAREHOUSE" && m.active) add("address", "Alamat gudang", "IDENTITAS LOKASI", "SEDANG", "Konfirmasi alamat lokasi dengan penanggung jawab gudang.");
  if ((m.sourceFileId || ["PENDING", "UNVERIFIED"].includes(data.sourceVerification)) && data.sourceVerification !== "VERIFIED") gap(masterGaps, "MASTER", m.id, m.kind, m.companyId, code, "Verifikasi sumber", "STATUS IMPOR", "TINGGI", owner, "Tinjau identitas, satuan, cabang dan kolom wajib sebelum digunakan dalam transaksi.", source);
}
let lineChecks = 0, lineErrors = 0, headerChecks = 0, headerErrors = 0, invalidReferences = 0, illegalPosted = 0;
for (const r of records) {
  if (input.companies.find((c: Row) => c.id === r.companyId)?.isDemo) continue;
  const def = definitions.find(d => d.key === r.module), data = r.data ?? {};
  const source = r.sourceFileId ? `${input.sources.find((s: Row) => s.id === r.sourceFileId)?.name ?? r.sourceFileId} / ${r.sourceRow ?? ""}` : "Database ERP";
  const add = (field: string, rule: string, priority: string, action: string) => gap(transactionGaps, "TRANSAKSI", r.id, r.module, r.companyId, r.number, field, rule, priority, ["attendances", "timesheets"].includes(r.module) ? "HR / Supervisor" : "Finance / Pemilik dokumen", action, source);
  for (const f of def?.fields ?? []) {
    if (f.required && blank(data[f.key])) add(f.label, "WAJIB FORMULIR", "TINGGI", "Lengkapi dari bukti dan pilih relasi master yang tepat.");
    if (f.master && !blank(data[f.key]) && !masters.some(m => m.id === data[f.key] && m.companyId === r.companyId && m.kind === f.master)) { invalidReferences++; add(f.label, "RELASI TIDAK SESUAI", "TINGGI", "Pilih master dalam perusahaan dan jenis yang sesuai."); }
  }
  if (r.status === "IMPORTED") add("Verifikasi transaksi", "STATUS IMPOR", "TINGGI", "Periksa bukti, nominal, tanggal dan pajak, lalu simpan draft. Jangan posting otomatis.");
  if (def?.lines && !r.lines.length) add("Rincian transaksi", "WAJIB FORMULIR", "TINGGI", "Isi kuantitas, satuan dan harga dari bukti transaksi.");
  if (r.module === "sales" && blank(data.dueDate)) { /* required field already listed */ }
  let sum = 0n;
  for (const l of r.lines) {
    const expected = (decimal(l.quantity, 3) * decimal(l.unitPrice) + 500n) / 1000n; sum += expected; lineChecks++;
    if (expected !== decimal(l.total)) { lineErrors++; add("Nominal rincian", "KUANTITAS × HARGA", "TINGGI", "Periksa rincian dan kebijakan pembulatan terhadap bukti."); }
    if (l.productId && !masters.some(m => m.id === l.productId && m.companyId === r.companyId && m.kind === "PRODUCT")) { invalidReferences++; add("Produk rincian", "RELASI TIDAK SESUAI", "TINGGI", "Perbaiki pemetaan produk sebelum verifikasi."); }
  }
  if (r.lines.length && ["sales", "purchase", "pos", "cash-advance", "expenses", "inventory", "manufacturing"].includes(r.module)) {
    let expected = sum;
    if (["sales", "purchase", "pos"].includes(r.module)) expected += (sum * decimal(data.taxPercent ?? "0", 4) + 500000n) / 1000000n;
    headerChecks++;
    if (decimal(r.amount) !== expected) { headerErrors++; nominalDifferences.push({ company: company(r.companyId), module: r.module, document: r.number, status: r.status, sourceAmount: num(decimal(r.amount)), lineTotal: num(sum), computedTotal: num(expected), difference: num(decimal(r.amount) - expected), source }); add("Total dokumen", "RINCIAN + PAJAK", "TINGGI", r.status === "IMPORTED" ? "Nominal sumber adalah ringkasan. Lengkapi rincian dan pajak sebelum menjadikannya draft operasional." : "Rekonsiliasi total rincian, pajak dan dokumen."); }
  }
  if (["sales", "purchase", "cash-advance", "expenses", "payments", "pos"].includes(r.module) && r.status === "POSTED" && !r.journalId && !["ORDER", "QUOTATION"].includes(data.documentType)) illegalPosted++;
}
check("Hitung ulang nominal rincian operasional", lineChecks, lineErrors, "Kuantitas 3 desimal × harga 2 desimal, pembulatan setengah ke atas dalam bigint.");
check("Total dokumen dibanding rincian dan pajak", headerChecks, headerErrors, "Selisih pada impor menandai rincian/pajak yang belum dilengkapi, bukan koreksi otomatis pada nominal sumber.");
check("Relasi transaksi dalam perusahaan dan jenis master", records.filter(r => r.companyId !== "DEMO").length, invalidReferences, "Relasi produk dan kolom master formulir diperiksa.");
check("Dokumen keuangan POSTED mempunyai jurnal", records.filter(r => r.companyId !== "DEMO" && r.status === "POSTED").length, illegalPosted, "Quotation/order tidak menimbulkan piutang/utang.");
let dbFactsMismatch = 0; const bySource = new Map(facts.map(f => [f.sourceKey, f]));
for (const source of bundle.facts) {
  const f = bySource.get(source.key); if (!f) { dbFactsMismatch++; continue; }
  if (f.kind !== source.kind || f.sheet !== source.sheet || f.row !== source.row || (f.column ?? null) !== (source.column ?? null)) dbFactsMismatch++;
  else if (["quantity", "debit", "credit", "amount"].some(k => (f[k] === null) !== (source[k] === null || source[k] === undefined) || f[k] !== null && decimal(f[k], k === "quantity" ? 3 : 2) !== decimal(source[k], k === "quantity" ? 3 : 2))) dbFactsMismatch++;
}
check("Nilai numerik dan lokasi sumber cocok dengan normalisasi unggahan", bundle.facts.length, dbFactsMismatch, "Setiap baris diuji berdasarkan sourceKey, jenis, sheet, baris, kolom serta kuantitas/debit/kredit/nominal. Null tetap null.");
const sourceJournals = facts.filter(f => f.kind === "FINANCIAL_JOURNAL" && f.companyId === "KBA");
const sourceDebit = sourceJournals.reduce((s, f) => s + decimal(f.debit), 0n), sourceCredit = sourceJournals.reduce((s, f) => s + decimal(f.credit), 0n);
const vouchers = new Map<string, bigint>(); for (const f of sourceJournals) vouchers.set(f.documentNumber ?? "NO_DOCUMENT", (vouchers.get(f.documentNumber ?? "NO_DOCUMENT") ?? 0n) + decimal(f.debit) - decimal(f.credit));
check("Keseimbangan jurnal sumber per voucher", vouchers.size, [...vouchers.values()].filter(v => v !== 0n).length, "Perputaran debit/kredit sumber, bukan omzet, kas atau jurnal ERP terposting.", num(sourceDebit), num(sourceCredit), "IDR");
const financial: Row[] = [];
for (const c of input.companies.filter((c: Row) => !c.isDemo)) {
  const journals = input.journals.filter((j: Row) => j.companyId === c.id && j.status === "POSTED");
  let debit = 0n, credit = 0n, failed = 0, revenue = 0n, expense = 0n;
  for (const j of journals) {
    let d = 0n, k = 0n;
    for (const l of j.lines) { d += decimal(l.debit); k += decimal(l.credit); const a = input.accounts.find((a: Row) => a.id === l.accountId); if (j.type !== "CLOSING") { if (a?.category === "PENDAPATAN") revenue += decimal(l.credit) - decimal(l.debit); if (a?.category === "BEBAN") expense += decimal(l.debit) - decimal(l.credit); } }
    debit += d; credit += k; if (d !== k || j.lines.length < 2) failed++;
  }
  financial.push({ company: c.code, posted: journals.length, debit: num(debit), credit: num(credit), revenue: num(revenue), expense: num(expense), profit: num(revenue - expense), lots: input.lots.filter((l: Row) => l.companyId === c.id).length });
  check(`Jurnal ERP POSTED ${c.code}`, journals.length, failed, "Semua jurnal harus seimbang dan memiliki sekurang-kurangnya dua baris. DEMO dikecualikan.", num(debit), num(credit), "IDR");
}
let stockCorrect = 0, stockIncomplete = 0, stockDifference = 0;
for (const f of facts.filter(f => f.kind === "STOCK_SNAPSHOT")) {
  const data = f.data ?? {}, warnings = data.warnings ?? [];
  if (blank(data.opening) || blank(data.sourceClosing)) stockIncomplete++;
  else if (!blank(data.calculated) && decimal(data.calculated, 3) === decimal(data.sourceClosing, 3) && !warnings.length) stockCorrect++;
  else stockDifference++;
  if (warnings.length) for (const warning of warnings) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, warning, "KENDALI STOK", "TINGGI", "Logistik / Supervisor", "Cocokkan saldo awal, tanda mutasi dan stok fisik. Jangan mencampurkan satuan.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
  gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, "Biaya unit dan bukti stok fisik", "PERSIAPAN SALDO STOK", "TINGGI", "Finance / Logistik", "Tinjau stok fisik dan faktur biaya sebelum membuat draft pembukaan stok.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
}
const sourceKinds: Record<string, number> = {}; for (const f of facts) sourceKinds[f.kind] = (sourceKinds[f.kind] ?? 0) + 1;
const daily = facts.filter(f => f.kind === "ATTENDANCE");
for (const f of daily) {
  const data = f.data ?? {}, where = `${f.sheet}!${f.row}${f.column ? ":kolom" + f.column : ""}`;
  if (data.attendanceStatus === "TIDAK_DIKETAHUI") gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, where, "Status kehadiran tidak diketahui", "KELENGKAPAN ABSENSI", "TINGGI", "HR / Supervisor", "Konfirmasi status pada tanggal sumber. Jangan mengubah kosong menjadi hadir atau alpha.", `${f.sourceFileId} / ${where}`);
  if (data.attendanceStatus === "TIDAK_LENGKAP") gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, where, "Waktu masuk / keluar belum lengkap", "KELENGKAPAN ABSENSI", "TINGGI", "HR / Supervisor", "Konfirmasi pasangan jam masuk dan keluar dari bukti absensi.", `${f.sourceFileId} / ${where}`);
  for (const warning of data.warnings ?? []) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, where, warning, "KENDALI ABSENSI", "TINGGI", "HR / Supervisor", "Konfirmasi absensi dan identitas pada sumber. Ketiadaan data bukan bukti hadir/alpha.", `${f.sourceFileId} / ${where}`);
  if (!f.employeeId) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, where, "Relasi karyawan", "PEMETAAN IDENTITAS", "TINGGI", "HR", "Padankan menggunakan ID kerja yang dapat dibuktikan, bukan kesamaan nama saja.", `${f.sourceFileId} / ${where}`);
}
for (const f of facts.filter(f => f.kind === "ATTENDANCE_SCAN" && f.status === "UNMATCHED")) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, "Identitas scan belum dipadankan", "PEMETAAN SCAN MENTAH", "TINGGI", "HR / Supervisor", "Cocokkan ID perangkat dengan ID kerja. Scan mentah dan hari absensi adalah butir berbeda; jangan dijumlahkan sebagai tambahan hari hadir.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
for (const f of facts.filter(f => f.kind === "ATTENDANCE_SUMMARY")) for (const warning of f.data?.warnings ?? []) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, warning, "RINGKASAN ABSENSI", "TINGGI", "HR / Supervisor", "Rekonsiliasi ringkasan deklarasi dengan hari yang tersedia pada sheet sumber.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
// Date gaps apply to document rows, not asset/bank registers or subtotals.
for (const f of facts.filter(f => f.kind === "FINANCIAL_SOURCE" && ["INV", "TRS", "INV_KCG", "TRS_KCG"].includes(f.sheet) && typeof f.data?.cells?.["1"] === "number")) {
  if (!f.effectiveDate) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, "Tanggal dokumen", "KELENGKAPAN SUMBER", "TINGGI", "Finance", "Konfirmasi tanggal dokumen dari bukti asli. Jangan mengisi tanggal impor sebagai tanggal transaksi.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
}
const sourceCodes = new Set(sourceJournals.filter(f => !f.accountId).map(f => f.data?.accountCode));
for (const code of sourceCodes) gap(sourceIssues, "SUMBER", `account:${code}`, "FINANCIAL_JOURNAL", "KBA", String(code), "Pemetaan COA", "AKUN PENAMPUNG", "TINGGI", "Finance", "Tentukan substansi dan akun tujuan dari bukti. Akun penampung sumber tidak diposting otomatis.", "Kertas kerja / JURNAL");
for (const issue of bundle.issues ?? []) gap(sourceIssues, "SUMBER", createHash("sha256").update(JSON.stringify(issue)).digest("hex").slice(0,16), "TEMUAN_SUMBER", "KBA", String(issue.sheet ?? issue.file ?? "SUMBER"), String(issue.code ?? issue.type ?? "Temuan sumber"), "KENDALI SUMBER", "TINGGI", "HR / Finance / Operasional", String(issue.message ?? issue.description ?? issue.detail ?? "Tinjau temuan asli pada sumber."), `${issue.file ?? ""} / ${issue.sheet ?? ""}${issue.row ? "!" + issue.row : ""}`);
const current = masters.filter(m => m.companyId === "KBA" && m.kind === "EMPLOYEE" && m.data?.currentRoster);
for (const f of facts.filter(f => f.data?.sourceRevision && f.status !== "REVIEWED")) gap(sourceIssues, "SUMBER", f.id, f.kind, f.companyId, `${f.sheet}!${f.row}`, f.data?.issuerPending ? "Konflik penerbit invoice" : "Revisi invoice belum direkonsiliasi", "REVISI DRIVE 23-NOV-2026", "TINGGI", "Finance / Komersial", "Bandingkan versi sebelumnya, invoice, bukti potong dan bank. Review sumber tidak memposting atau mengganti jurnal historis.", `${f.sourceFileId} / ${f.sheet}!${f.row}`);
for (const f of facts.filter(f => f.kind === "CONTROL" && f.sheet === "TEMUAN" && f.data?.cells?.["1"])) {
  const code = String(f.data.cells["1"]), stores = (input.moduleSettings ?? []).filter((s: Row) => s.companyId === f.companyId).flatMap((s: Row) => Object.values(s.settings ?? {})) as Row[];
  const resolved = stores.some(s => ["RESOLVED", "ACCEPTED_RISK"].includes(s.findings?.[code]?.status));
  if (!resolved) gap(sourceIssues, "SUMBER", f.id, "TEMUAN_KERTAS_KERJA", f.companyId, code, String(f.data.cells["2"] ?? code), "FINALISASI LAPORAN", f.data.cells["4"] === "T" ? "TINGGI" : "SEDANG", String(f.data.cells["7"] ?? "Finance"), String(f.data.cells["6"] ?? "Selesaikan dengan bukti dan sign-off Finance / Direksi."), `${f.sourceFileId} / TEMUAN!${f.row}`);
}
const expectedIds = bundle.masters.filter((m: Row) => m.kind === "EMPLOYEE" && m.data?.currentRoster).map((m: Row) => String(m.data.workId));
check("Roster terkini sesuai ID kerja sumber", expectedIds.length, expectedIds.filter((id: string) => !current.some(m => String(m.data.workId) === id)).length + current.filter(m => !expectedIds.includes(String(m.data.workId))).length, "Keanggotaan himpunan diperiksa dua arah; nama sama dengan ID berbeda tetap berbeda.");
const summary = { capturedAt: input.capturedAt, auditedAt: new Date().toISOString(), companies: input.companies.filter((c: Row) => !c.isDemo).map((c: Row) => ({ code: c.code, active: c.active })), masters: masters.filter(m => m.companyId !== "DEMO").length, records: records.filter(r => r.companyId !== "DEMO").length, sourceFacts: facts.length, sourceKinds, currentRoster: current.length, activeRoster: current.filter(m => m.active).length, historicalEmployees: masters.filter(m => m.companyId === "KBA" && m.kind === "EMPLOYEE" && !m.data?.currentRoster).length, unknownAttendance: daily.filter(f => f.data?.attendanceStatus === "TIDAK_DIKETAHUI").length, unmappedAttendance: daily.filter(f => !f.employeeId).length, stockCorrect, stockIncomplete, stockDifference, sourceVouchers: vouchers.size, sourceDebit: num(sourceDebit), sourceCredit: num(sourceCredit), masterFieldsMissing: masterGaps.length, masterRecordsAffected: new Set(masterGaps.map(g => g.recordKey)).size, transactionFieldsMissing: transactionGaps.length, transactionRecordsAffected: new Set(transactionGaps.map(g => g.recordKey)).size, sourceFindings: sourceIssues.length, financial };
const enrichedSummary = { ...summary, historicalUploaded: masters.filter(m => m.companyId === "KBA" && m.kind === "EMPLOYEE" && m.data?.historicalOnly && m.data?.importBatch === bundle.batch).length, identityReviewDays: daily.filter(f => f.data?.warnings?.includes("KARYAWAN_BELUM_DIPADANKAN")).length };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ summary: enrichedSummary, masterGaps, transactionGaps, sourceIssues, nominalDifferences, reconciliations, sources: input.sources.map((s: Row) => ({ name: s.name, sha256: s.sha256, rowCount: s.rowCount, status: s.status })), moduleCounts: modules.map(m => ({ module: m.key, name: m.name, documents: records.filter(r => r.companyId !== "DEMO" && r.module === m.key).length })) }));
console.log(JSON.stringify({ status: "AUDIT_COMPLETE", masterGaps: masterGaps.length, transactionGaps: transactionGaps.length, sourceFindings: sourceIssues.length, checks: reconciliations.length, output }));
