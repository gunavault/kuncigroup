import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
const digest = (s) => createHash("sha256").update(String(s)).digest("hex");
const txt = (v) =>
  v === null || v === undefined
    ? ""
    : v instanceof Date
      ? Number.isNaN(v.getTime())
        ? "[Tanggal tidak valid]"
        : v.toISOString().slice(0, 10)
      : typeof v === "object"
        ? "result" in v
          ? txt(v.result)
          : "richText" in v
            ? v.richText.map((x) => x.text).join("")
            : "text" in v
              ? txt(v.text)
              : "error" in v
                ? v.error
                : ""
        : String(v).trim();
const val = (row, col) => {
  const v = row.getCell(col).value;
  return v && typeof v === "object" && "result" in v ? v.result : v;
};
const num = (v) => {
  const t = txt(v);
  if (typeof v === "number" && Number.isFinite(v) && v >= 0)
    return v.toFixed(2);
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t).toFixed(2) : null;
};
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");
const out = {
  generatedAt: new Date().toISOString(),
  accounts: [],
  branches: [],
  masters: [],
  records: [],
  rows: [],
  files: [],
};
const masterMap = new Map();
function master(
  kind,
  name,
  data = {},
  companyId = "KBA",
  branchId = null,
  key = "",
) {
  name = txt(name).replace(/\s+/g, " ");
  if (!name || name.length < 2) return null;
  const canonical = `${companyId}|${kind}|${norm(name)}|${kind === "EMPLOYEE" ? (txt(data.internalCode) ? "internal:" + norm(data.internalCode) : (branchId ?? "")) : kind === "PRODUCT" ? norm(data.uom ?? "") : ""}`;
  if(kind==="EMPLOYEE"&&/^[0-9]{16}$/.test(String(data.internalCode??"").replaceAll(" ",""))) {data={...data};delete data.internalCode;}
  if (masterMap.has(canonical)) return masterMap.get(canonical);
  const h = digest(canonical).slice(0, 14),
    id = `src-${kind.toLowerCase()}-${h}`,
    m = {
      id,
      companyId,
      branchId,
      kind,
      code: `${kind.slice(0, 3)}-${h.slice(0, 9).toUpperCase()}`,
      name,
      data: { ...data, sourceVerification: "PENDING" },
      sourceKey: key || `master:${digest(canonical)}`,
    };
  out.masters.push(m);
  masterMap.set(canonical, m);
  return m;
}
const branchMap = new Map();
function branch(name, companyId = "KBA") {
  name = txt(name);
  if (/candr|chandr/i.test(name) && /halim/i.test(name)) return null;
  if (/candr|chandr|candrab/i.test(name)) name = "GOR Candrabhaga";
  if (/^(database halim|admin - halim|halim - probation)$/i.test(name))
    name = "HALIM";
  const n = norm(name);
  if (!n) return null;
  const key = `${companyId}:${n}`;
  if (branchMap.has(key)) return branchMap.get(key);
  const b = {
    id: `${companyId}-BR-${digest(n).slice(0, 10)}`,
    companyId,
    code: `SITE-${digest(n).slice(0, 7).toUpperCase()}`,
    name: txt(name),
  };
  out.branches.push(b);
  branchMap.set(key, b);
  return b;
}
function addRow(
  file,
  sheet,
  row,
  kind,
  data,
  issue,
  targetId = null,
  companyId = "KBA",
  status = "REVIEW",
) {
  if(kind==="EMPLOYEE"&&/^[0-9]{16}$/.test(String(data.internalCode??"").replaceAll(" ",""))) {data={...data};delete data.internalCode;}
  const fingerprint = digest(`${file}:${sheet}:${row}:${kind}`);
  out.rows.push({
    companyId,
    sourceFileId: file,
    sheet,
    row,
    kind,
    fingerprint,
    status,
    data,
    issue,
    targetId,
  });
  return fingerprint;
}
async function workbook(id) {
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(`data/drive/${id}.xlsx`);
  out.files.push({
    id,
    sha256: digest(readFileSync(`data/drive/${id}.xlsx`)),
    rowCount: 0,
  });
  return w;
}
const coaId = "1_WIybZaDuUq3mHrJTahcWhfRimSx1sPr";
const coa = await workbook(coaId);
coa.getWorksheet("AKUN").eachRow((r, n) => {
  const code = txt(val(r, 2)),
    name = txt(val(r, 3));
  if (!/^\d{5}$/.test(code)) return;
  const side =
    txt(val(r, 5)).toLowerCase() === "cr"
      ? "KREDIT"
      : txt(val(r, 5)).toLowerCase() === "db"
        ? "DEBIT"
        : null;
  if (!name || !side) {
    addRow(
      coaId,
      "AKUN",
      n,
      "ACCOUNT",
      { code, name, side },
      "Nama akun atau saldo normal belum diisi. Lengkapi dan verifikasi dengan Finance.",
    );
    return;
  }
  const category = code.startsWith("1")
    ? "ASET"
    : code.startsWith("2")
      ? "KEWAJIBAN"
      : code.startsWith("3")
        ? "EKUITAS"
        : /^[47]/.test(code)
          ? "PENDAPATAN"
          : "BEBAN";
  const normal =
    category === "ASET" || category === "BEBAN" ? "DEBIT" : "KREDIT";
  out.accounts.push({
    id: `coa-${code}`,
    code,
    name,
    category,
    normalBalance: side,
    isContra: side !== normal,
    isCash: ["11101", "11103", "11104", "11105"].includes(code),
    isSystemAccount: ["31101", "31103", "31105"].includes(code),
  });
  addRow(
    coaId,
    "AKUN",
    n,
    "ACCOUNT",
    { code, name, normalBalance: side },
    "Kode, nama, dan sisi normal disalin dari sumber; saldo awal tidak tersedia.",
    `coa-${code}`,
    "KBA",
    "VERIFIED",
  );
});
const invId = "1exi1_-ohKvGWcbhMQyYXuTjXO6n5lvb7";
const stock = await workbook(invId);
for (const s of stock.worksheets) {
  s.eachRow((r, n) => {
    if (!/^\d+$/.test(txt(val(r, 1))) || !txt(val(r, 2))) return;
    const name = txt(val(r, 2)),
      uom = txt(val(r, 4)) || "";
    const m = master(
      "PRODUCT",
      name,
      {
        type: "STOCK",
        uom,
        brand: txt(val(r, 6)),
        sourceQuantity: txt(val(r, 3)),
        sourceLocation: s.name,
        sourceFileId: invId,
      },
      "KBA",
      null,
      `${invId}:${s.name}:${n}`,
    );
    if (m) {
      m.sourceFileId = invId;
      m.sourceRow = `${s.name}!${n}`;
      addRow(
        invId,
        s.name,
        n,
        "PRODUCT",
        { name, uom, sourceQuantity: txt(val(r, 3)), sourceLocation: s.name },
        "Daftar inventaris historis 2024. Kuantitas sumber bukan stok saat ini; perlu stock opname dan valuasi.",
        m.id,
      );
    }
  });
}
const macId = "1GEepGsTpaRBG543WBR7SkE8byLKaSoL-";
const mac = await workbook(macId);
for (const s of mac.worksheets) {
  s.eachRow((r, n) => {
    if (!/^\d+$/.test(txt(val(r, 1))) || !txt(val(r, 2)) || !txt(val(r, 3)))
      return;
    const m = master("PRODUCT", txt(val(r, 2)), {
      type: "STOCK",
      uom: txt(val(r, 3)),
      sourceType: "BUDGET_RAB",
      sourceFileId: macId,
    });
    if (m) {
      m.sourceFileId ??= macId;
      m.sourceRow ??= `${s.name}!${n}`;
      addRow(
        macId,
        s.name,
        n,
        "PRODUCT",
        { name: m.name, uom: txt(val(r, 3)), plannedQuantity: txt(val(r, 4)) },
        "RAB/kebutuhan rencana tidak sama dengan penerimaan atau saldo stok.",
        m.id,
      );
    }
  });
}
const assetId = "1AcTb382PAMswCwlrzISLCwlW4qW7DHEG";
const assets = await workbook(assetId);
for (const s of assets.worksheets) {
  if (s.name !== "Sheet1") continue;
  s.eachRow((r, n) => {
    if (!/^\d+$/.test(txt(val(r, 1))) || !txt(val(r, 2))) return;
    const m = master("ASSET", txt(val(r, 2)), {
      sourceYear: txt(val(r, 3)),
      sourceQuantity: txt(val(r, 4)),
      cost: num(val(r, 5)) ?? "",
      sourceFileId: assetId,
    });
    if (m) {
      m.sourceFileId = assetId;
      m.sourceRow = `${s.name}!${n}`;
      addRow(
        assetId,
        s.name,
        n,
        "ASSET",
        {
          name: m.name,
          year: txt(val(r, 3)),
          quantity: txt(val(r, 4)),
          unitCost: num(val(r, 5)),
        },
        "Daftar aset agregat sumber; nomor seri, pemegang, lokasi, dan kondisi perlu diverifikasi.",
        m.id,
      );
    }
  });
}
for (const id of [
  "1LFEp6-chTrq_0LRyNVPD2FtkMQaMQnfF",
  "1js5pdjsShP6o5bcVrm1xOcITz-gH55J4",
  "1sTthmr9kJDYO-QUHrJuWbJDS-t6XL1NW",
  "16T-wHJZTVztyWj1mgYagPXbGLm3d1UuY",
]) {
  const w = await workbook(id);
  for (const s of w.worksheets) {
    let headers = null,
      headerRow = 0;
    s.eachRow((r, n) => {
      const cells = [];
      r.eachCell((c, i) => {
        const t = norm(txt(c.value));
        if (t) cells.push([i, t]);
      });
      if (!headers) {
        const name = cells.find(([, t]) =>
            /^nama( lengkap| karyawan)?$/.test(t),
          ),
          position = cells.find(([, t]) => /jabatan/.test(t));
        if (name && position) {
          headers = {
            name: name[0],
            position: position[0],
            location: cells.find(([, t]) =>
              /lokasi kerja|penempatan|project/.test(t),
            )?.[0],
            joined: cells.find(([, t]) => t === "tmt" || t === "start")?.[0],
            email: cells.find(([, t]) => t.includes("email"))?.[0],
            code: cells.find(([, t]) => t === "nik" || t === "nip")?.[0],
          };
          headerRow = n;
        }
        return;
      }
      if (n <= headerRow) return;
      const name = txt(val(r, headers.name)),
        position = txt(val(r, headers.position));
      if (
        !name ||
        (name === txt(val(r, 1)) && /spv|leader|halim/i.test(name)) ||
        /^(nama|spv & leader|halim - pandawa|lain lain|total|jumlah)/i.test(
          name,
        ) ||
        name.length < 3
      )
        return;
      if (!position || /spv & leader/i.test(position)) return;
      const location = headers.location
        ? txt(val(r, headers.location))
        : s.name;
      const b = branch(location || s.name);
      const m = master(
        "EMPLOYEE",
        name,
        {
          position,
          location,
          joinedAt:
            headers.joined &&
            /^\d{4}-\d{2}-\d{2}$/.test(txt(val(r, headers.joined)))
              ? txt(val(r, headers.joined))
              : "",
          sourceJoinedAt: headers.joined ? txt(val(r, headers.joined)) : "",
          email: headers.email ? txt(val(r, headers.email)) : "",
          internalCode: headers.code ? txt(val(r, headers.code)) : "",
          sourceFileId: id,
        },
        "KBA",
        b?.id ?? null,
        `${id}:${s.name}:${n}`,
      );
      if (m) {
        m.sourceFileId ??= id;
        m.sourceRow ??= `${s.name}!${n}`;
        addRow(
          id,
          s.name,
          n,
          "EMPLOYEE",
          {
            name,
            position,
            location,
            internalCode: headers.code ? txt(val(r, headers.code)) : "",
          },
          "Verifikasi identitas kerja, status aktif, cabang, dan sertifikasi. KTP, KK, rekening, agama, dan data keluarga tidak disalin ke aplikasi.",
          m.id,
        );
      }
    });
  }
}
const invoiceId = "1g5UlDm9uaUJorIRb_GxbCV1krKMxMDOQ";
const invoices = await workbook(invoiceId);
const invoiceKeys = new Map();
for (const s of invoices.worksheets.filter((s) =>
  ["2025", "2026"].includes(s.name),
)) {
  const off = s.name === "2026" ? 1 : 0;
  s.eachRow((r, n) => {
    const number = txt(val(r, 3 + off)),
      date = val(r, 4 + off),
      name = txt(val(r, 5 + off));
    if (!/INV/i.test(number) || !name) return;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      addRow(
        invoiceId,
        s.name,
        n,
        "INVOICE",
        { number, sourceDate: txt(date), customer: name },
        "Tanggal invoice kosong atau tidak valid; perbaiki dari dokumen asli.",
      );
      return;
    }
    const companyId = /^KCG/i.test(number)
      ? "KCG"
      : /^KCL/i.test(number)
        ? "KCL"
        : /^KBL/i.test(number)
          ? "KBL"
          : "KBA";
    const partner = master(
      "PARTNER",
      name,
      { type: "CUSTOMER", sourceFileId: invoiceId },
      companyId,
    );
    const base = num(val(r, 7 + off)),
      tax = num(val(r, 8 + off)) ?? "0.00",
      wht = num(val(r, 9 + off)) ?? "0.00";
    const issue = [];
    if (base === null)
      issue.push(
        "Nilai bukan angka (misalnya compliment); tidak dibuat transaksi moneter.",
      );
    const key = addRow(
      invoiceId,
      s.name,
      n,
      "INVOICE",
      {
        number,
        date: txt(date),
        customer: name,
        description: txt(val(r, 6 + off)),
        base: base ?? txt(val(r, 7 + off)),
        vat: tax,
        withholding: wht,
        sourceTotal: txt(val(r, 10 + off)),
        sourcePaymentDate: txt(val(r, 11 + off)),
        sourceStatus: txt(val(r, 13 + off)),
        sourceReceived: txt(val(r, 15 + off)),
      },
      issue.join(" ") ||
        "Verifikasi nilai, PPN/PPh, pembayaran, dan kelengkapan bukti. Tidak ada jurnal atau penerimaan kas otomatis.",
      null,
      companyId,
    );
    if (base === null || Number(base) <= 0) return;
    const id = `src-inv-${key.slice(0, 20)}`,
      total = (Number(base) + Number(tax)).toFixed(2);
    const d = {
      partnerId: partner.id,
      documentType: "INVOICE",
      originalInvoiceNumber: number,
      sourceIssuer: s.name === "2026" ? txt(val(r, 3)) : "",
      sourceReceived: txt(val(r, 15 + off)),
      sourceStatus: txt(val(r, 13 + off)),
      sourceWithholding: wht,
      sourceTotal: txt(val(r, 10 + off)),
      taxPercent:
        Number(base) > 0
          ? ((Number(tax) / Number(base)) * 100).toFixed(4)
          : "0",
      subtotal: base,
      tax,
      importSourceUrl: `https://drive.google.com/file/d/${invoiceId}/view`,
    };
    out.records.push({
      id,
      companyId,
      module: "sales",
      number: `IMP-${companyId}-${key.slice(0, 16).toUpperCase()}`,
      title: `${number} · ${txt(val(r, 6 + off)).slice(0, 160)}`,
      date: txt(date),
      amount: total,
      data: d,
      sourceKey: key,
      sourceFileId: invoiceId,
      sourceRow: `${s.name}!${n}`,
      lines: [
        {
          description: txt(val(r, 6 + off)) || number,
          quantity: "1.000",
          unitPrice: base,
          total: base,
          data: {},
        },
      ],
    });
    out.rows.at(-1).targetId = id;
    const duplicateKey = `${companyId}:${norm(number)}`;
    invoiceKeys.set(duplicateKey, [
      ...(invoiceKeys.get(duplicateKey) ?? []),
      key,
    ]);
  });
}
for (const keys of invoiceKeys.values())
  if (keys.length > 1)
    for (const key of keys) {
      const row = out.rows.find((r) => r.fingerprint === key);
      row.issue +=
        " Nomor invoice duplikat dalam register; rekonsiliasi revisi/dokumen asli diperlukan.";
      const doc = out.records.find((r) => r.sourceKey === key);
      if (doc) doc.data.duplicateInvoice = true;
    }
const caId = "1ePRKauZj_snufiwg2laG-ATfUj2-LBlL";
const ca = await workbook(caId);
for (const s of ca.worksheets.filter((s) => s.name.startsWith("BD"))) {
  let date = null,
    voucher = "";
  const companyId = s.name.includes("KCL") ? "KCL" : "KBA";
  s.eachRow((r, n) => {
    if (/^Date$/i.test(txt(val(r, 3))) && val(r, 5) instanceof Date)
      date = txt(val(r, 5));
    if (/Voucher No/i.test(txt(val(r, 3)))) voucher = txt(val(r, 5));
    const no = txt(val(r, 4)),
      person = txt(val(r, 5)),
      type = txt(val(r, 6)),
      description = txt(val(r, 8)),
      amount = num(val(r, 9));
    if (
      !no ||
      !person ||
      !amount ||
      Number(amount) <= 0 ||
      /^Nomor CA$/i.test(no)
    )
      return;
    const kind = /^ca$/i.test(type) ? "CASH_ADVANCE" : "BANK_DISBURSEMENT";
    const key = addRow(
      caId,
      s.name,
      n,
      kind,
      {
        number: no,
        person,
        submissionType: type,
        project: txt(val(r, 7)),
        description,
        amount,
        voucher,
        voucherDate: date,
      },
      "Rekonsiliasi tanggal voucher, nomor CA, penerima, persetujuan, dan pertanggungjawaban. Referensi tahun dapat berbeda dari tanggal pencairan.",
      null,
      companyId,
    );
    if (kind !== "CASH_ADVANCE" || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return;
    const employee = master(
      "EMPLOYEE",
      person,
      {
        position: "",
        sourceFileId: caId,
        sourceType: "CA_PAYEE_REQUIRES_HR_REVIEW",
      },
      companyId,
    );
    const id = `src-ca-${key.slice(0, 20)}`;
    out.records.push({
      id,
      companyId,
      module: "cash-advance",
      number: `IMP-CA-${key.slice(0, 18).toUpperCase()}`,
      title: `${no} · ${description}`.slice(0, 250),
      date,
      amount,
      data: {
        employeeId: employee.id,
        purpose: description,
        originalAdvanceNumber: no,
        sourceVoucher: voucher,
        sourceProject: txt(val(r, 7)),
      },
      sourceKey: key,
      sourceFileId: caId,
      sourceRow: `${s.name}!${n}`,
      lines: [
        {
          description: description || no,
          quantity: "1.000",
          unitPrice: amount,
          total: amount,
          data: {},
        },
      ],
    });
    out.rows.at(-1).targetId = id;
  });
}
const pettyId = "165qx8j0hLHF5CM-pngPSs9VvzwCYx_Nb";
const petty = await workbook(pettyId);
for (const s of petty.worksheets)
  s.eachRow((r, n) => {
    if (!/^\d+$/.test(txt(val(r, 1))) || !txt(val(r, 3))) return;
    addRow(
      pettyId,
      s.name,
      n,
      "EXPENSE",
      {
        date: txt(val(r, 2)),
        activity: txt(val(r, 3)),
        location: txt(val(r, 4)),
        person: txt(val(r, 5)),
        description: txt(val(r, 6)),
        meals: num(val(r, 7)),
        transport: num(val(r, 8)),
        parking: num(val(r, 9)),
        other: num(val(r, 10)),
        sourceTotal: txt(val(r, 11)),
      },
      "Tanggal teks dan bukti kas perlu dicocokkan. Klaim historis belum menjadi biaya diposting.",
    );
  });
for (const b of out.branches) {
  master(
    "WAREHOUSE",
    `Lokasi ${b.name}`,
    { type: "SITE", sourceVerification: "PENDING" },
    b.companyId,
    b.id,
  );
  master(
    "PROJECT",
    b.name,
    { cluster: "CLEANING", sourceVerification: "PENDING" },
    b.companyId,
    b.id,
  );
}
for (const f of out.files)
  f.rowCount = out.rows.filter((r) => r.sourceFileId === f.id).length;
writeFileSync("data/drive-normalized.json", JSON.stringify(out));
console.log(
  JSON.stringify(
    {
      accounts: out.accounts.length,
      branches: out.branches.length,
      masters: out.masters.length,
      records: out.records.length,
      reviewRows: out.rows.length,
      companies: [...new Set(out.records.map((r) => r.companyId))],
      missingCoa: out.rows
        .filter((r) => r.kind === "ACCOUNT" && r.status === "REVIEW")
        .map((r) => r.data.code),
    },
    null,
    2,
  ),
);
