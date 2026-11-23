import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { managementReport } from "./management-report";

type Report = Awaited<ReturnType<typeof managementReport>>;
const idr = (v: string | number) =>
  Number(v).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const ascii = (s: string) => s.normalize("NFKD").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, " ");

export function plRows(r: Report): [string, string][] {
  const p = r.profitLoss;
  return [
    ["Pendapatan usaha", p.revenue],
    ["Beban pokok pendapatan (HPP)", p.cogs],
    ["Laba kotor", p.grossProfit],
    ["Beban usaha", p.opex],
    ["Laba usaha", p.operatingProfit],
    ["Pendapatan/(beban) lain-lain", p.other],
    ["Laba sebelum pajak", p.preTax],
    ["Beban pajak penghasilan", p.tax],
    ["Laba (rugi) bersih", p.netProfit],
  ];
}

export async function managementPdf(r: Report) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]), y = 800;
  const ink = rgb(0.08, 0.17, 0.18), muted = rgb(0.36, 0.42, 0.44);
  const next = (h: number) => { if (y - h < 50) { page = pdf.addPage([595, 842]); y = 800; } };
  const text = (s: string, x: number, size = 9, strong = false, color = ink) => page.drawText(ascii(s), { x, y, size, font: strong ? bold : font, color });
  const wrap = (s: string, width: number, size: number) => {
    const out: string[] = []; let cur = "";
    for (const w of ascii(s).split(" ")) { const t = cur ? cur + " " + w : w; if (font.widthOfTextAtSize(t, size) > width) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur); return out;
  };
  const para = (s: string, size = 9) => { for (const l of wrap(s, 510, size)) { next(14); text(l, 42, size); y -= 13; } y -= 4; };
  const heading = (s: string) => { y -= 6; next(26); text(s, 42, 11, true); y -= 18; };
  const row = (label: string, value: string, strong = false) => { next(15); text(label, 42, 9, strong); const v = idr(value); page.drawText(v, { x: 553 - (strong ? bold : font).widthOfTextAtSize(v, 9), y, size: 9, font: strong ? bold : font, color: ink }); y -= 14; };

  text(`${r.company.name} | Laporan Manajemen`, 42, 16, true); y -= 22;
  text(`${r.period.name} (${r.period.status}) | IDR | ${r.basis}`, 42, 9, false, muted); y -= 20;
  heading("Ringkasan eksekutif");
  r.narrative.forEach((n) => para(n));
  heading("Laba rugi");
  plRows(r).forEach(([k, v], i) => row(k, v, [2, 4, 8].includes(i)));
  heading("Posisi akhir periode");
  row("Kas dan setara kas", r.position.cash); row("Piutang usaha", r.position.receivables); row("Utang usaha", r.position.payables);
  row("Total aset", r.position.assets, true); row("Total liabilitas", r.position.liabilities); row("Ekuitas", r.position.equity);
  r.position.suspense.forEach((s) => row(`Penampung ${s.code} ${s.name}`, s.balance));
  heading("Arus kas");
  row("Kas awal", r.cashFlow.opening); row("Operasi", r.cashFlow.operating); row("Investasi", r.cashFlow.investing); row("Pendanaan", r.cashFlow.financing); row("Kas akhir", r.cashFlow.ending, true);
  heading("Tren bulanan (pendapatan | HPP | beban usaha | laba bersih)");
  r.trend.forEach((t) => { next(15); text(t.label, 42); [t.revenue, t.cogs, t.opex, t.net].forEach((v, i) => { const s = idr(v); page.drawText(s, { x: 260 + i * 98 - font.widthOfTextAtSize(s, 9) + 90, y, size: 9, font, color: ink }); }); y -= 14; });
  heading("Biaya terbesar");
  r.topExpenses.forEach((e) => row(`${e.code} ${e.name}`, e.value));
  if (r.findings.length) {
    heading(`Temuan kertas kerja (${r.findings.length}); kontrol CEK ${r.controls.ok}/${r.controls.total} OK`);
    r.findings.forEach((f) => para(`${f.code} [${f.severity}] ${f.issue} | Nilai ${f.amount ? idr(f.amount) : "-"} | Tindakan: ${f.action} | PIC: ${f.owner} | Target: ${f.due}`, 8));
  }
  pdf.getPages().forEach((p, i) => p.drawText(`Kunci Group | Laporan manajemen | ${i + 1}/${pdf.getPageCount()}`, { x: 42, y: 28, size: 7, font, color: muted }));
  pdf.setTitle(ascii(`${r.company.name} - Laporan Manajemen ${r.period.name}`));
  return pdf.save();
}

export async function managementXlsx(r: Report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kunci Group";
  const head = (sh: ExcelJS.Worksheet) => {
    sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sh.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B36" } };
    sh.views = [{ state: "frozen", ySplit: 1 }];
  };
  const sum = wb.addWorksheet("Ringkasan");
  sum.addRow([`${r.company.name} - Laporan Manajemen`, r.period.name, r.basis]);
  r.narrative.forEach((n) => sum.addRow([n]));
  sum.getColumn(1).width = 140;
  const pl = wb.addWorksheet("Laba rugi");
  pl.addRow(["Pos", "IDR"]); plRows(r).forEach(([k, v]) => pl.addRow([k, Number(v)])); head(pl);
  pl.addRow([]); pl.addRow(["Posisi akhir", ""]);
  ([["Kas", r.position.cash], ["Piutang usaha", r.position.receivables], ["Utang usaha", r.position.payables], ["Aset", r.position.assets], ["Liabilitas", r.position.liabilities], ["Ekuitas", r.position.equity], ["Selisih neraca", r.position.balanceDifference], ["Estimasi dalam jurnal", r.position.estimates]] as const).forEach(([k, v]) => pl.addRow([k, Number(v)]));
  r.position.suspense.forEach((s) => pl.addRow([`Penampung ${s.code} ${s.name}`, Number(s.balance)]));
  pl.columns.forEach((c, i) => (c.width = i ? 22 : 48));
  const tr = wb.addWorksheet("Tren bulanan");
  tr.addRow(["Bulan", "Pendapatan", "HPP", "Beban usaha", "Laba bersih"]);
  r.trend.forEach((t) => tr.addRow([t.label, Number(t.revenue), Number(t.cogs), Number(t.opex), Number(t.net)])); head(tr);
  tr.columns.forEach((c) => (c.width = 22));
  const ex = wb.addWorksheet("Biaya terbesar");
  ex.addRow(["Kode", "Akun", "Kelompok", "IDR"]); r.topExpenses.forEach((e) => ex.addRow([e.code, e.name, e.group, Number(e.value)])); head(ex);
  ex.columns.forEach((c, i) => (c.width = i === 1 ? 44 : 24));
  const fi = wb.addWorksheet("Temuan");
  fi.addRow(["Kode", "Temuan", "Nilai", "Tingkat", "Dasar", "Tindakan", "PIC", "Target"]);
  r.findings.forEach((f) => fi.addRow([f.code, f.issue, f.amount ? Number(f.amount) : null, f.severity, f.basis, f.action, f.owner, f.due])); head(fi);
  fi.columns.forEach((c, i) => (c.width = [1, 5].includes(i) ? 60 : 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
