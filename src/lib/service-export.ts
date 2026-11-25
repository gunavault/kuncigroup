import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { serviceReport } from "./service-report";
import { calkSections } from "./service-plans-ui";
type Report = Awaited<ReturnType<typeof serviceReport>>;
const safe = (value: unknown) => typeof value === "string" && /^[=+@-]/.test(value) ? "'" + value : value;
const available = (value: string | null) => value ?? "Belum tersedia";

/** Exact decimal strings retain cents; forecasts and notes stay explicitly draft. */
export async function serviceXlsx(r: Report) {
  const wb = new ExcelJS.Workbook(); wb.creator = "Kunci Group ERP";
  function sheet(name: string, headers: string[], rows: unknown[][]) {
    const s = wb.addWorksheet(name); s.addRow(headers);
    rows.forEach(row => s.addRow(row.map(safe)));
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF185E49" } };
    s.columns.forEach(c => { c.width = 28; });
    s.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; });
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, s.rowCount), column: headers.length } };
    return s;
  }
  sheet("Dasar laporan", ["Informasi", "Nilai"], [
    ["Perusahaan", r.company.name], ["Periode", r.period.name], ["Tanggal laporan", r.period.asOf],
    ["Status catatan dan rencana", "DRAFT — memerlukan tinjauan/finalisasi bisnis"],
    ["Satuan uang", "IDR; nominal disimpan sebagai teks desimal presisi dua angka"],
    ["Kerangka", r.plan.framework], ["Dasar keputusan", r.plan.frameworkEvidence],
    ["Biaya tenaga kerja", available(r.labor.cost)], ["Pendapatan", r.labor.revenue],
    ["Dasar biaya tenaga kerja", r.labor.note],
    ["Rasio tenaga kerja / pendapatan (%)", available(r.labor.ratio)],
    ...r.caveats.map(note => ["Keterbatasan", note]),
  ]);
  sheet("Rekonsiliasi AR AP", ["Jenis", "Akun kontrol", "Saldo buku besar IDR", "Rincian IDR", "Belum dipadankan IDR"],
    Object.entries(r.aging).map(([key, a]) => [key.toUpperCase(), a.account, available(a.ledger), a.detailTotal, available(a.unallocated)]));
  sheet("Aging", ["Jenis", "Dokumen", "Pihak", "Tanggal", "Jatuh tempo", "Kelompok", "Nilai awal IDR", "Penyelesaian IDR", "Saldo IDR", "Jurnal ID", "Periode jurnal ID"],
    Object.entries(r.aging).flatMap(([key, a]) => a.rows.map(d => [key.toUpperCase(), d.number, d.party, d.date, d.due || "Belum diketahui", d.bucket, d.initial, d.paid, d.balance, d.journalId, d.periodId])));
  sheet("Profitabilitas site", ["Site", "Pendapatan IDR", "Beban langsung jasa IDR", "Beban lainnya IDR", "Laba rugi IDR", "Margin (%)"],
    r.sites.map(s => [s.name, s.revenue, s.direct, s.operating, s.profit, available(s.margin)]));
  sheet("Anggaran aktual", ["Proyek", "Kategori", "Anggaran IDR", "Aktual IDR", "Sisa IDR", "Bukti anggaran", "Keterbatasan"],
    r.budgets.map(b => [b.projectName, b.category, b.amount, available(b.actual), available(b.variance), b.evidence, b.note]));
  sheet("Rencana kas", ["Tanggal", "Arah", "Kategori", "Proyek ID", "Nilai IDR", "Saldo skenario IDR", "Kebutuhan dana IDR", "Bukti"],
    [[r.period.asOf, "KAS DASAR BUKU BESAR", "", "", available(r.cash.opening), available(r.cash.opening), "", r.cash.note],
      ...r.cash.plans.map(p => [p.date, p.direction, p.category, p.projectId, p.amount, available(p.balance), available(p.shortfall), p.evidence])]);
  sheet("Alokasi analitis", ["Baris jurnal ID", "Proyek ID", "Nilai IDR", "Rujukan bukti"], r.plan.allocations.map(a => [a.lineId, a.projectId, a.amount, a.evidence]));
  sheet("CaLK draft", ["Bagian", "Catatan"], calkSections.map(([key, label]) => [label, r.plan.notes[key] || "Belum diisi; memerlukan bukti dan tinjauan"]));
  if (r.workingPaper.available) {
    const w = r.workingPaper;
    sheet("WP Site", ["Site sumber", "Pendapatan IDR", "Beban langsung jasa IDR", "Beban usaha IDR", "Lainnya IDR", "Pajak IDR", "Laba IDR", "Baris jurnal"], w.sites.rows.map(s => [s.site, s.revenue, s.direct, s.operating, s.other, s.tax, s.profit, s.lines]));
    sheet("WP Invoice", ["INV baris", "Invoice", "Tanggal", "Pelanggan", "Site", "Neto IDR", "Diterima IDR", "Sisa IDR", "Umur sejak invoice (hari)", "Kelompok"], w.receivables.open.map(i => [i.row, i.number, i.date, i.customer, i.site, available(i.net), available(i.received), available(i.outstanding), i.days, i.bucket]));
    sheet("WP Utang", ["OPS_UTANG baris", "Uraian", "Vendor", "Tanggal", "Akun", "Site", "Saldo IDR", "TRS baris"], w.payables.rows.map(p => [p.row, p.description, p.vendor, p.date, p.account, p.site, p.balance, p.treasuryRow]));
    sheet("WP Proyeksi kas", ["PROYEKSI_KAS baris", "Uraian", ...w.cashProjection.months, "Kolom E", "Dasar"], w.cashProjection.rows.map(p => [p.row, p.label, ...p.values.map(available), available(p.total), p.basis]));
    sheet("WP Payroll", ["UJI_PAYROLL baris", "Uraian", "Nilai sumber", "Satuan", "Dasar"], w.laborTest.rows.map(p => [p.row, p.label, p.ratio ? p.ratioValue : p.value, p.ratio ? "rasio desimal" : "IDR", p.basis]));
    sheet("WP RAB indikatif", ["Site", "Bulan invoice teramati", "Kategori", "Per bulan IDR", "Cakupan indikatif IDR", "Biaya akun terpilih IDR", "Selisih indikatif IDR", "Dasar / keterbatasan"], w.budgets.sites.flatMap(s => s.rows.map(b => [s.site, s.months, b.label, available(b.monthly), available(b.budget), available(b.actual), available(b.variance), `${w.budgets.note} ${b.note ?? ""}`])));
    const basis = wb.getWorksheet("Dasar laporan")!;
    [...w.sources.map(s => `${s.name} ${s.url ?? ""}`), w.sites.note, w.receivables.note, `Baris invoice belum lengkap: ${w.receivables.incomplete}.`, w.payables.note, w.payables.detailNote, w.cashProjection.note, w.laborTest.note, w.budgets.note].forEach(note => basis.addRow(["Sumber kertas kerja", note]));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function servicePdf(r: Report) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]), y = 800;
  const ascii = (v: string) => v.normalize("NFKD").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ");
  function line(text: string, size = 10) {
    if (y < 45) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(ascii(text), { x: 40, y, size, font, color: rgb(0.09, 0.20, 0.17) }); y -= size + 7;
  }
  function paragraph(text: string) {
    let row = "";
    for (const word of ascii(text).split(/\s+/)) {
      // Break long references too, so no text can escape the printable page.
      const pieces = word.match(/.{1,70}/g) ?? [""];
      for (const piece of pieces) { if (font.widthOfTextAtSize(`${row} ${piece}`, 10) > 510 && row) { line(row); row = piece; } else row = row ? `${row} ${piece}` : piece; }
    }
    if (row) line(row);
  }
  line("Siklus akuntansi jasa dan CaLK", 16); paragraph(`${r.company.name} | ${r.period.name} | ${r.period.asOf} | IDR`);
  paragraph("DRAFT - Catatan dan rencana memerlukan tinjauan bisnis. Nominal adalah IDR. Rencana tidak membentuk jurnal.");
  for (const [key, a] of Object.entries(r.aging)) paragraph(`${key.toUpperCase()} | ${a.account} | Buku besar ${available(a.ledger)} | Rincian ${a.detailTotal} | Belum dipadankan ${available(a.unallocated)}`);
  line("Profitabilitas site", 12); for (const s of r.sites) paragraph(`${s.name} | Pendapatan ${s.revenue} | Beban langsung jasa ${s.direct} | Beban lainnya ${s.operating} | Laba/rugi ${s.profit}`);
  paragraph(`${r.labor.note} Biaya ${available(r.labor.cost)}; pendapatan ${r.labor.revenue}; rasio ${available(r.labor.ratio)}%.`);
  line("Anggaran dan aktual", 12); if (!r.budgets.length) paragraph("Belum ada anggaran berbukti.");
  for (const b of r.budgets) paragraph(`${b.projectName} | ${b.category} | Anggaran ${b.amount} | Aktual ${available(b.actual)} | Sisa ${available(b.variance)} | ${b.evidence} | ${b.note}`);
  line("Rencana kas", 12); paragraph(`Kas dasar ${available(r.cash.opening)}. ${r.cash.note}`);
  for (const p of r.cash.plans) paragraph(`${p.date} ${p.direction} ${p.category} ${p.amount} | Saldo ${available(p.balance)} | Kebutuhan dana ${available(p.shortfall)} | ${p.evidence}`);
  line("CaLK draft", 12); paragraph(`Kerangka ${r.plan.framework}. ${r.plan.frameworkEvidence || "Dasar keputusan belum tersedia."}`);
  for (const [key, label] of calkSections) { paragraph(label); paragraph(r.plan.notes[key] || "Belum diisi; memerlukan bukti dan tinjauan."); }
  if (r.workingPaper.available) {
    const w = r.workingPaper; line("Analisis kertas kerja sumber", 12); paragraph(w.sites.note);
    for (const s of w.sites.rows) paragraph(`${s.site} | Pendapatan ${s.revenue} | Beban langsung ${s.direct} | Laba ${s.profit}`);
    paragraph(`Selisih laba sumber terhadap GL ${w.sites.difference}. Piutang terbuka register ${w.receivables.total}; saldo kontrol ${available(w.receivables.ledger)}; selisih ${available(w.receivables.difference)}; baris belum lengkap ${w.receivables.incomplete}. ${w.receivables.note}`);
    paragraph(`${w.cashProjection.note} Selisih kas dasar proyeksi terhadap GL ${available(w.cashProjection.openingDifference)}. Rincian sumber, utang, payroll dan RAB indikatif tersedia di Excel dan aplikasi.`);
  }
  r.caveats.forEach(paragraph); paragraph("Rincian aging dan alokasi analitis tersedia dalam ekspor Excel dan penelusuran aplikasi.");
  return Buffer.from(await pdf.save());
}
