import type ExcelJS from "exceljs";
import type { financialRatios } from "./financial-ratios";
export type RatioReport = Awaited<ReturnType<typeof financialRatios>>;
export function addRatioSheet(wb: ExcelJS.Workbook, report: RatioReport) {
  const sheet = wb.addWorksheet("Rasio");
  sheet.addRow(["Kelompok", "Rasio", "Nilai", "Satuan", "Rumus", "Pembilang", "Penyebut", "Dasar / keterbatasan"]);
  for (const r of report.ratios) {
    const row = sheet.addRow([r.group, r.label, r.value === null ? null : Number(r.value), r.unit, r.formula, r.numerator, r.denominator, [r.basis, r.reason].filter(Boolean).join(" | ")]);
    row.getCell(3).numFmt = '0.00'; row.alignment = { wrapText: true, vertical: "top" }; row.height = 66;
  }
  sheet.columns.forEach((column, index) => { column.width = [1, 4, 7].includes(index) ? 48 : [5, 6].includes(index) ? 25 : 18; });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B36" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: report.ratios.length + 1, column: 8 } };
  sheet.addRow([]); report.notes.forEach(note => { const row = sheet.addRow([note]); sheet.mergeCells(row.number, 1, row.number, 8); row.height = 32; row.alignment = { wrapText: true, vertical: "top" }; });
}
