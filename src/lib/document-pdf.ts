import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PrintableDocument = {
  company: string;
  branch: string;
  module: string;
  number: string;
  title: string;
  date: string;
  status: string;
  amount: string;
  settled: string;
  fields: { label: string; value: string }[];
  lines: {
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
    /** Line section, e.g. "Management Fee". Lines without a group go into the regular section. */
    group?: string;
  }[];
};
const REGULAR = "Biaya operasional / reimbursable";
/** Groups lines (regular section first) and computes per-section subtotals in cents. */
export function groupLines(lines: PrintableDocument["lines"]) {
  const groups = new Map<string, PrintableDocument["lines"]>();
  for (const l of lines) {
    const key = l.group || REGULAR;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === REGULAR ? -1 : b === REGULAR ? 1 : a.localeCompare(b),
  );
  return ordered.map(([name, items]) => ({
    name,
    items,
    subtotal: items.reduce(
      (s, l) => s + BigInt(Math.round(Number(l.total) * 100)),
      0n,
    ),
  }));
}
const text = (s: string) =>
  String(s)
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const money = (s: string) =>
  Number(s).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function documentPdf(d: PrintableDocument) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.17, 0.18),
    muted = rgb(0.36, 0.42, 0.44),
    green = rgb(0.07, 0.37, 0.32);
  let page = pdf.addPage([595.28, 841.89]),
    y = 792;
  const wrap = (s: string, width: number, size = 10) => {
    const out: string[] = [];
    let line = "";
    for (const word of text(s).split(" ")) {
      if (
        font.widthOfTextAtSize((line ? line + " " : "") + word, size) <= width
      ) {
        line += (line ? " " : "") + word;
        continue;
      }
      if (line) out.push(line);
      line = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(line + ch, size) > width) {
          out.push(line);
          line = "";
        }
        line += ch;
      }
    }
    if (line) out.push(line);
    return out.length ? out : ["-"];
  };
  const draw = (
    s: string,
    x: number,
    yy: number,
    size = 10,
    strong = false,
    color = ink,
  ) =>
    page.drawText(text(s), {
      x,
      y: yy,
      size,
      font: strong ? bold : font,
      color,
    });
  const next = (height = 20) => {
    if (y - height < 65) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
      draw(d.number + " | lanjutan", 44, y, 9, true, green);
      y -= 28;
    }
  };
  const paragraph = (s: string, size = 10, strong = false) => {
    for (const line of wrap(s, 507, size)) {
      next(16);
      draw(line, 44, y, size, strong);
      y -= size + 5;
    }
  };
  paragraph(d.company, 16, true);
  y -= 4;
  draw("KUNCI GROUP  /  " + d.module.toUpperCase(), 44, y, 9, true, green);
  y -= 25;
  paragraph(d.title, 14, true);
  y -= 3;
  paragraph(d.number, 11, true);
  paragraph("Tanggal: " + d.date + "   |   Cabang: " + d.branch, 9);
  paragraph("Status: " + d.status, 9, true);
  if (d.status !== "POSTED")
    paragraph(
      "BELUM DIPOSTING - dokumen belum memengaruhi buku besar.",
      9,
      true,
    );
  y -= 14;
  for (const f of d.fields) {
    const value = wrap(f.value, 335, 9),
      label = wrap(f.label, 155, 9),
      height = Math.max(value.length, label.length);
    for (let i = 0; i < height; i++) {
      next(16);
      if (label[i]) draw(label[i], 44, y, 9, true, muted);
      if (value[i]) draw(value[i], 210, y, 9);
      y -= 14;
    }
    y -= 8;
  }
  if (d.lines.length) {
    const header = () => {
      next(40);
      page.drawRectangle({
        x: 40,
        y: y - 7,
        width: 515,
        height: 25,
        color: rgb(0.92, 0.96, 0.95),
      });
      draw("Uraian", 48, y, 9, true);
      draw("Qty", 322, y, 9, true);
      draw("Harga IDR", 382, y, 9, true);
      draw("Total IDR", 480, y, 9, true);
      y -= 32;
    };
    header();
    const sections = groupLines(d.lines),
      sectioned = sections.length > 1;
    const rows: (
      | { kind: "line"; line: PrintableDocument["lines"][number] }
      | { kind: "title" | "subtotal"; name: string; subtotal: bigint }
    )[] = [];
    for (const g of sections) {
      if (sectioned) rows.push({ kind: "title", name: g.name, subtotal: 0n });
      for (const line of g.items) rows.push({ kind: "line", line });
      if (sectioned)
        rows.push({ kind: "subtotal", name: g.name, subtotal: g.subtotal });
    }
    for (const row of rows) {
      if (row.kind !== "line") {
        if (y - 24 < 65) {
          next(24);
          header();
        }
        if (row.kind === "title") draw(text(row.name).toUpperCase(), 48, y, 9, true, green);
        else {
          const value = money((Number(row.subtotal) / 100).toFixed(2));
          draw("Subtotal " + text(row.name), 48, y, 9, true);
          draw(value, 548 - bold.widthOfTextAtSize(value, 9), y, 9, true);
        }
        y -= 22;
        continue;
      }
      const l = row.line;
      const description = wrap(l.description, 250, 9),
        height = Math.max(28, description.length * 13 + 12);
      if (y - height < 65) {
        next(height);
        header();
      }
      description.forEach((v, i) => draw(v, 48, y - i * 13, 9));
      for (const [value, right] of [
        [l.quantity, 352],
        [money(l.unitPrice), 446],
        [money(l.total), 548],
      ] as const)
        draw(value, right - font.widthOfTextAtSize(value, 9), y, 9);
      y -= height;
      page.drawLine({
        start: { x: 44, y: y + 7 },
        end: { x: 551, y: y + 7 },
        thickness: 0.4,
        color: rgb(0.86, 0.9, 0.89),
      });
    }
  }
  y -= 10;
  next(85);
  draw("NILAI DOKUMEN  IDR " + money(d.amount), 300, y, 11, true, green);
  y -= 20;
  draw("Sudah diselesaikan  IDR " + money(d.settled), 300, y, 9);
  y -= 20;
  paragraph(
    "Persetujuan dan jejak pencatatan tersimpan di ERP. Dokumen ini bukan faktur pajak.",
    8,
  );
  pdf.getPages().forEach((p, i) => {
    p.drawLine({
      start: { x: 44, y: 46 },
      end: { x: 551, y: 46 },
      thickness: 0.5,
      color: rgb(0.82, 0.87, 0.85),
    });
    p.drawText("Kunci Group | " + text(d.number), {
      x: 44,
      y: 31,
      size: 8,
      font,
      color: muted,
    });
    p.drawText(`${i + 1} / ${pdf.getPageCount()}`, {
      x: 520,
      y: 31,
      size: 8,
      font,
      color: muted,
    });
  });
  pdf.setTitle(text(d.number + " - " + d.title));
  pdf.setAuthor(text(d.company));
  return pdf.save();
}
