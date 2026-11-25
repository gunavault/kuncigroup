import { snapshot } from "@/lib/accounting";
import { requireActor, authorizeCompany, allowedBranches } from "@/lib/auth";
import { db } from "@/lib/db";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { managementReport } from "@/lib/management-report";
import { managementPdf, managementXlsx } from "@/lib/management-export";
import { financialRatios } from "@/lib/financial-ratios";
import { addRatioSheet } from "@/lib/ratio-export";
import { finalizationStatus } from "@/lib/finalization";
import { serviceReport } from "@/lib/service-report";
import { serviceXlsx, servicePdf } from "@/lib/service-export";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    const url = new URL(req.url);
    const id = url.searchParams.get("period");
    const period = id
      ? await db.fiscalPeriod.findUniqueOrThrow({ where: { id } })
      : null;
    const company = period?.companyId ?? url.searchParams.get("company") ?? "DEMO";
    authorizeCompany(actor, company, [
      "ADMIN",
      "FINANCE",
      "MANAGER",
      "AUDITOR",
    ]);
    if (actor.mustChangePassword || allowedBranches(actor, company).length)
      throw new Error("Akses laporan tidak diizinkan.");
    if (url.searchParams.get("report") === "service") {
      if (!id) throw new Error("Pilih periode laporan jasa.");
      const r = await serviceReport(actor, company, id), pdf = url.searchParams.get("format") === "pdf";
      const name = `siklus-jasa-${company}-${r.period.name}`.replace(/[^A-Za-z0-9-]/g, "-");
      return new Response(new Uint8Array(pdf ? await servicePdf(r) : await serviceXlsx(r)), { headers: {
        "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.${pdf ? "pdf" : "xlsx"}"`, "Cache-Control": "no-store",
      } });
    }
    if (url.searchParams.get("report") === "management") {
      const m = await managementReport(company, id ?? undefined);
      const ratios = await financialRatios(actor, company, m.period.id);
      const pdf = url.searchParams.get("format") === "pdf";
      const name = `laporan-manajemen-${m.company.id}-${m.period.name}`.replace(/[^A-Za-z0-9-]+/g, "-");
      return new Response(
        new Uint8Array(pdf ? await managementPdf(m, ratios) : await managementXlsx(m, ratios)),
        {
          headers: {
            "Content-Type": pdf
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${name}.${pdf ? "pdf" : "xlsx"}"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    const s = await snapshot(id ?? undefined, company);
    const r = s.report;
    const ratios = await financialRatios(actor, company, s.period.id), finalization = await finalizationStatus(company, s.period.id);
    const summary = [
      ["Pendapatan", r.revenue],
      ["Beban", r.expense],
      ["Laba bersih", r.profit],
      ["Modal sebelum laba/prive", r.capitalBefore],
      ["Prive", r.drawings],
      ["Modal akhir", r.equity],
      ["Aset", r.assets],
      ["Kewajiban", r.liabilities],
      ["Selisih neraca", r.balanceDifference],
      ["Kas awal", r.cash.opening],
      ["Arus kas operasional", r.cash.operating],
      ["Arus kas investasi", r.cash.investing],
      ["Arus kas pendanaan", r.cash.financing],
      ["Kas akhir", r.cash.ending],
      ["Selisih arus kas", r.cash.difference],
    ];
    if (url.searchParams.get("format") === "pdf") {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let page = pdf.addPage([595, 842]),
        y = 795;
      const line = (text: string, size = 10) => {
        if (y < 45) {
          page = pdf.addPage([595, 842]);
          y = 795;
        }
        page.drawText(text.normalize("NFKD").replace(/[–—]/g, "-").replace(/·/g, "|").replace(/[^\x20-\x7E]/g, "?"), {
          x: 40,
          y,
          size,
          font,
          color: rgb(0.09, 0.15, 0.23),
        });
        y -= 20;
      };
      line(s.company.name + " | Laporan Keuangan", 16);
      line(`${s.period.name} | ${s.period.status} | IDR`);
      line(`STATUS LAPORAN: ${finalization.state === "DRAFT" ? "DRAFT - BELUM FINAL" : finalization.state === "FINAL_WITH_EXCEPTIONS" ? "FINAL DENGAN PENGECUALIAN" : "FINAL"}`);
      line(
        s.period.companyId === "DEMO"
          ? "Data simulasi - bukan pembukuan resmi KBA"
          : "Laporan berdasarkan jurnal posted",
      );
      y -= 12;
      for (const [label, value] of summary)
        line(`${label.padEnd(32)} ${value}`);
      y -= 12;
      line("NERACA SALDO SETELAH PENYESUAIAN", 12);
      for (const a of r.rows)
        line(
          `${a.code} ${a.name.slice(0, 26).padEnd(27)} D ${a.debit} / K ${a.credit}`,
        );
      const paragraph = (text: string) => {
        let current = "";
        for (const word of text.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").split(/\s+/)) {
          if (font.widthOfTextAtSize(`${current} ${word}`, 10) > 505 && current) { line(current); current = word; } else current = current ? `${current} ${word}` : word;
        }
        if (current) line(current);
      };
      line("RASIO KEUANGAN DAN OPERASIONAL", 12); paragraph(ratios.basis);
      for (const ratio of ratios.ratios) {
        paragraph(`${ratio.label}: ${ratio.value === null ? "Belum tersedia" : `${ratio.value} ${ratio.unit}`}`);
        paragraph(`${ratio.formula}. Pembilang ${ratio.numerator}; penyebut ${ratio.denominator}.${ratio.reason ? ` ${ratio.reason}` : ""}`);
      }
      ratios.notes.forEach(paragraph);
      return new Response(Buffer.from(await pdf.save()), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="kunci-laporan.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "Kunci Group";
    const info = wb.addWorksheet("Laporan");
    info.addRow([
      s.company.name + (s.company.isDemo ? " - SIMULASI" : ""),
      s.period.name,
      s.period.status,
    ]);
    info.addRow([`STATUS LAPORAN: ${finalization.state === "DRAFT" ? "DRAFT - BELUM FINAL" : finalization.state}`]);
    info.addRow(["Laporan", "Nilai IDR"]);
    summary.forEach(([k, v]) => info.addRow([k, Number(v)]));
    const sheet = wb.addWorksheet("Kertas Kerja");
    sheet.addRow([
      "Kode",
      "Akun",
      "Sebelum penyesuaian (D-K)",
      "Penyesuaian (D-K)",
      "Debit NSSP",
      "Kredit NSSP",
    ]);
    r.rows.forEach((a) =>
      sheet.addRow([
        a.code,
        a.name,
        Number(a.before),
        Number(a.adjustment),
        Number(a.debit),
        Number(a.credit),
      ]),
    );
    sheet.addRow([
      "",
      "TOTAL",
      "",
      "",
      Number(r.trialDebit),
      Number(r.trialCredit),
    ]);
    const journal = wb.addWorksheet("Jurnal");
    journal.addRow([
      "Nomor",
      "Tanggal",
      "Jenis",
      "Status",
      "Deskripsi",
      "Akun",
      "Debit",
      "Kredit",
    ]);
    s.journals.forEach((e) =>
      e.lines.forEach((l) =>
        journal.addRow([
          e.journalNumber,
          e.transactionDate.toISOString().slice(0, 10),
          e.type,
          e.status,
          e.description,
          l.account.code,
          Number(l.debit),
          Number(l.credit),
        ]),
      ),
    );
    for (const sh of wb.worksheets) {
      sh.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sh.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF123B36" },
      };
      sh.columns.forEach((c, i) => {
        c.width = i === 1 || i === 4 ? 38 : 24;
      });
      sh.views = [{ state: "frozen", ySplit: 1 }];
    }
    addRatioSheet(wb, ratios);
    return new Response(Buffer.from(await wb.xlsx.writeBuffer()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="kunci-laporan.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Ekspor gagal. Periksa login dan koneksi database." },
      { status: 400 },
    );
  }
}
