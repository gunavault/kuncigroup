export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "datetime-local"
    | "number"
    | "select"
    | "checkbox"
    | "textarea";
  required?: boolean;
  options?: string[];
  master?: string;
  hint?: string;
};
export type ModuleDefinition = {
  key: string;
  name: string;
  subtitle: string;
  group: string;
  icon: string;
  color: string;
  fields: Field[];
  lines?: boolean;
  dependencies?: string[];
  integration?: string;
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  required = false,
  extra: Partial<Field> = {},
): Field => ({ key, label, type, required, ...extra });
export const modules: ModuleDefinition[] = [
  {
    key: "discuss",
    name: "Discuss",
    subtitle: "Percakapan, notifikasi & tindak lanjut",
    group: "Kolaborasi",
    icon: "MessagesSquare",
    color: "purple",
    fields: [],
  },
  {
    key: "cash-advance",
    name: "Cash Advance",
    subtitle: "Pengajuan, pencairan & pertanggungjawaban",
    group: "Keuangan",
    icon: "Wallet",
    color: "orange",
    fields: [
      f("employeeId", "Pemegang kasbon", "select", true, {
        master: "EMPLOYEE",
      }),
      f("dueDate", "Batas pertanggungjawaban", "date", true),
      f("projectId", "Proyek", "select", false, { master: "PROJECT" }),
      f("purpose", "Tujuan penggunaan", "textarea", true),
    ],
    lines: true,
  },
  {
    key: "sales",
    name: "Sales",
    subtitle: "Kontrak, invoice & piutang pelanggan",
    group: "Komersial",
    icon: "TrendingUp",
    color: "blue",
    fields: [
      f("documentType", "Jenis dokumen", "select", false, {
        options: ["INVOICE", "ORDER", "QUOTATION"],
      }),
      f("partnerId", "Pelanggan", "select", true, { master: "PARTNER" }),
      f("projectId", "Proyek / kontrak", "select", false, {
        master: "PROJECT",
      }),
      f("dueDate", "Jatuh tempo", "date", true),
      f("warehouseId", "Gudang pengeluaran", "select", false, {
        master: "WAREHOUSE",
      }),
      f("taxPercent", "PPN efektif (%)", "number", false, {
        hint: "Diisi sesuai ketentuan transaksi; tidak diasumsikan otomatis.",
      }),
    ],
    lines: true,
    dependencies: ["accounting"],
  },
  {
    key: "dashboards",
    name: "Dashboards",
    subtitle: "Kinerja perusahaan, cabang & proyek",
    group: "Analitik",
    icon: "ChartNoAxesCombined",
    color: "teal",
    fields: [],
  },
  {
    key: "accounting",
    name: "Accounting",
    subtitle: "Jurnal, buku besar & tutup buku",
    group: "Keuangan",
    icon: "Landmark",
    color: "teal",
    fields: [],
  },
  {
    key: "purchase",
    name: "Purchase",
    subtitle: "Tagihan pemasok & penerimaan barang",
    group: "Komersial",
    icon: "ShoppingCart",
    color: "blue",
    fields: [
      f("documentType", "Jenis dokumen", "select", false, {
        options: ["BILL", "ORDER", "RFQ"],
      }),
      f("partnerId", "Pemasok", "select", true, { master: "PARTNER" }),
      f("dueDate", "Jatuh tempo", "date", true),
      f("warehouseId", "Gudang penerimaan", "select", false, {
        master: "WAREHOUSE",
      }),
      f("taxPercent", "PPN masukan efektif (%)", "number"),
    ],
    lines: true,
    dependencies: ["accounting", "inventory"],
  },
  {
    key: "inventory",
    name: "Inventory",
    subtitle: "Mutasi, lokasi, lot & kedaluwarsa",
    group: "Operasional",
    icon: "Boxes",
    color: "teal",
    fields: [
      f("operation", "Jenis mutasi", "select", true, {
        options: ["RECEIVE", "ISSUE", "TRANSFER"],
      }),
      f("warehouseId", "Gudang asal / penerimaan", "select", true, {
        master: "WAREHOUSE",
      }),
      f("destinationId", "Gudang tujuan (transfer)", "select", false, {
        master: "WAREHOUSE",
      }),
      f("reason", "Alasan mutasi", "textarea", true),
    ],
    lines: true,
  },
  {
    key: "barcode",
    name: "Barcode",
    subtitle: "Pindai barang, lot & aset",
    group: "Operasional",
    icon: "ScanLine",
    color: "purple",
    fields: [],
    dependencies: ["inventory"],
  },
  {
    key: "employees",
    name: "Employees",
    subtitle: "Personel, jabatan & sertifikasi",
    group: "SDM",
    icon: "Users",
    color: "pink",
    fields: [],
  },
  {
    key: "expenses",
    name: "Expenses",
    subtitle: "Klaim biaya & penyelesaian kasbon",
    group: "Keuangan",
    icon: "Receipt",
    color: "orange",
    fields: [
      f("employeeId", "Karyawan", "select", true, { master: "EMPLOYEE" }),
      f("advanceId", "Nomor kasbon (opsional)"),
      f("projectId", "Proyek", "select", false, { master: "PROJECT" }),
      f("attachmentId", "ID bukti unggahan", "text", true),
      f("notes", "Keterangan", "textarea"),
    ],
    lines: true,
    dependencies: ["accounting", "cash-advance"],
  },
  {
    key: "apps",
    name: "Apps",
    subtitle: "Aktivasi modul & status integrasi",
    group: "Administrasi",
    icon: "Grid2X2",
    color: "purple",
    fields: [],
  },
  {
    key: "settings",
    name: "Settings",
    subtitle: "Perusahaan, cabang & hak akses",
    group: "Administrasi",
    icon: "Settings2",
    color: "slate",
    fields: [],
  },
  {
    key: "pos",
    name: "Point of Sale",
    subtitle: "Kasir, penjualan tunai & penutupan sif",
    group: "Kuliner",
    icon: "Monitor",
    color: "orange",
    fields: [
      f("partnerId", "Pelanggan (opsional)", "select", false, {
        master: "PARTNER",
      }),
      f("warehouseId", "Gudang / outlet", "select", true, {
        master: "WAREHOUSE",
      }),
      f("shift", "Nama sif", "text", true),
      f("paymentMethod", "Metode pembayaran", "select", true, {
        options: ["CASH", "BANK"],
      }),
      f("taxPercent", "PPN efektif (%)", "number"),
    ],
    lines: true,
    dependencies: ["sales", "inventory", "accounting"],
    integration:
      "Online food delivery memerlukan API dan kontrak penyedia; konektor belum dikonfigurasi.",
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    subtitle: "Resep, konsumsi bahan & hasil produksi",
    group: "Kuliner",
    icon: "CookingPot",
    color: "orange",
    fields: [
      f("bomId", "Resep / BOM", "select", true, { master: "BOM" }),
      f("warehouseId", "Gudang / central kitchen", "select", true, {
        master: "WAREHOUSE",
      }),
      f("quantity", "Jumlah hasil produksi", "number", true),
      f("lotCode", "Lot hasil produksi", "text", true),
      f("expiresAt", "Kedaluwarsa hasil", "date", true),
    ],
    dependencies: ["inventory"],
  },
  {
    key: "project",
    name: "Project",
    subtitle: "WO, pekerjaan, lokasi & SLA",
    group: "Lapangan",
    icon: "BriefcaseBusiness",
    color: "blue",
    fields: [
      f("projectId", "Proyek / lokasi", "select", true, { master: "PROJECT" }),
      f("assigneeId", "Penanggung jawab", "select", false, {
        master: "EMPLOYEE",
      }),
      f("startAt", "Mulai", "date", true),
      f("dueDate", "Target selesai", "date", true),
      f("checklist", "Daftar pekerjaan", "textarea", true),
      f("completion", "Penyelesaian (%)", "number"),
      f("acceptance", "Referensi BAST / bukti penyelesaian"),
    ],
  },
  {
    key: "timesheets",
    name: "Timesheets",
    subtitle: "Jam kerja & alokasi biaya proyek",
    group: "Lapangan",
    icon: "Clock3",
    color: "blue",
    fields: [
      f("employeeId", "Karyawan", "select", true, { master: "EMPLOYEE" }),
      f("projectId", "Proyek", "select", true, { master: "PROJECT" }),
      f("startAt", "Mulai kerja", "datetime-local", true),
      f("endAt", "Selesai kerja", "datetime-local", true),
      f("hourlyRate", "Tarif biaya per jam", "number"),
      f("work", "Uraian pekerjaan", "textarea", true),
    ],
    dependencies: ["project"],
  },
  {
    key: "attendances",
    name: "Attendances",
    subtitle: "Sif, check-in GPS & pemeriksaan radius",
    group: "SDM",
    icon: "MapPin",
    color: "pink",
    fields: [
      f("employeeId", "Karyawan", "select", true, { master: "EMPLOYEE" }),
      f("checkIn", "Check-in", "datetime-local", true),
      f("checkOut", "Check-out", "datetime-local"),
      f("latitude", "Latitude", "number", true),
      f("longitude", "Longitude", "number", true),
      f("accuracy", "Akurasi GPS (meter)", "number", true),
      f("shift", "Nomor jadwal sif (opsional)"),
      f("overrideReason", "Alasan pengecualian GPS", "textarea"),
    ],
    integration:
      "Kamera dan GPS memakai izin browser. Mesin sidik jari memerlukan API/perangkat vendor.",
  },
  {
    key: "quality",
    name: "Quality",
    subtitle: "Checklist kebersihan & pemeriksaan bahan",
    group: "Lapangan",
    icon: "ShieldCheck",
    color: "teal",
    fields: [
      f("projectId", "Proyek", "select", false, { master: "PROJECT" }),
      f("lotId", "ID lot (receiving)"),
      f("temperature", "Suhu terukur (°C)", "number"),
      f("minimum", "Batas suhu minimum (°C)", "number"),
      f("maximum", "Batas suhu maksimum (°C)", "number"),
      f("result", "Hasil pemeriksaan", "select", true, {
        options: ["PASS", "FAIL"],
      }),
      f("checklist", "Hasil checklist / temuan", "textarea", true),
      f("correctiveAction", "Tindakan koreksi", "textarea"),
    ],
  },
  {
    key: "maintenance",
    name: "Maintenance",
    subtitle: "Aset, jadwal servis & tindak lanjut",
    group: "Operasional",
    icon: "Wrench",
    color: "slate",
    fields: [
      f("assetId", "Aset", "select", true, { master: "ASSET" }),
      f("maintenanceType", "Jenis", "select", true, {
        options: ["PREVENTIVE", "CORRECTIVE"],
      }),
      f("dueDate", "Jadwal servis", "date", true),
      f("nextDueDate", "Servis berikutnya", "date"),
      f("cost", "Biaya servis", "number"),
      f("result", "Hasil pekerjaan", "textarea", true),
    ],
  },
];
// Financial settlement is accessed from the finance workspace, not an installable module.
export const paymentModule: ModuleDefinition = {
  key: "payments",
  name: "Pembayaran",
  subtitle: "Penerimaan piutang / pembayaran utang / pengembalian kasbon",
  group: "Keuangan",
  icon: "Wallet",
  color: "teal",
  fields: [
    f("referenceId", "Nomor invoice / kasbon", "text", true),
    f("direction", "Jenis pembayaran", "select", true, {
      options: ["RECEIVE", "PAY", "ADVANCE_RETURN"],
    }),
    f("amount", "Nilai kas yang dibayarkan", "number", true),
    f("withheldAmount", "Pajak dipotong (PPh) yang dibuktikan", "number"),
    f("attachmentId", "Bukti potong (jika ada PPh)"),
  ],
  dependencies: ["accounting"],
};
export const handoverModule: ModuleDefinition = {
  key: "asset-handover",
  name: "Serah terima aset",
  subtitle: "Pemegang dan lokasi aset",
  group: "Operasional",
  icon: "ScanLine",
  color: "teal",
  fields: [
    f("assetId", "Aset", "select", true, { master: "ASSET" }),
    f("employeeId", "Penerima aset", "select", true, { master: "EMPLOYEE" }),
    f("location", "Lokasi penempatan", "text", true),
    f("condition", "Kondisi", "select", true, {
      options: ["GOOD", "DAMAGED", "NEEDS_SERVICE"],
    }),
    f("notes", "Catatan serah terima", "textarea"),
  ],
};
export const shiftModule: ModuleDefinition = {
  key: "shifts",
  name: "Jadwal sif",
  subtitle: "Penugasan personel per lokasi",
  group: "SDM",
  icon: "Clock3",
  color: "pink",
  fields: [
    f("employeeId", "Karyawan", "select", true, { master: "EMPLOYEE" }),
    f("projectId", "Proyek", "select", true, { master: "PROJECT" }),
    f("startAt", "Mulai sif", "datetime-local", true),
    f("endAt", "Selesai sif", "datetime-local", true),
  ],
};
export const posCloseModule: ModuleDefinition = {
  key: "pos-close",
  name: "Tutup sif POS",
  subtitle: "Rekonsiliasi kasir",
  group: "Kuliner",
  icon: "Monitor",
  color: "orange",
  fields: [
    f("shift", "Nama sif", "text", true),
    f("countedCash", "Kas fisik penjualan (tanpa saldo awal)", "number", true),
    f("notes", "Catatan selisih", "textarea"),
  ],
};
export const definitions = [
  ...modules,
  paymentModule,
  handoverModule,
  shiftModule,
  posCloseModule,
];
export const masterDefinitions: Record<
  string,
  { label: string; fields: Field[] }
> = {
  DEPARTMENT: {label:'Departemen',fields:[]},
  POSITION: {label:'Jabatan',fields:[]},
  ASSET_CLASS: {label:'Kelas aset',fields:[f('usefulLife','Masa manfaat (tahun)','number'),f('assetAccount','Kode akun aset'),f('depreciationAccount','Kode akun akumulasi penyusutan'),f('expenseAccount','Kode akun beban penyusutan')]},
  PARTNER: {
    label: "Pelanggan & pemasok",
    fields: [
      f("type", "Jenis", "select", true, {
        options: ["CUSTOMER", "VENDOR", "BOTH"],
      }),
      f("email", "Email"),
      f("phone", "Telepon"),
      f("address", "Alamat", "textarea"),
      f("taxId", "NPWP perusahaan"),
    ],
  },
  PRODUCT: {
    label: "Barang & jasa",
    fields: [
      f("type", "Jenis", "select", true, { options: ["STOCK", "SERVICE"] }),
      f("uom", "Satuan", "text", true),
      f("barcode", "Barcode unik"),
      f("salePrice", "Harga jual", "number"),
      f("cost", "Harga pokok referensi", "number"),
      f("reorder", "Stok minimum", "number"),
      f("trackExpiry", "Wajib lot / kedaluwarsa", "checkbox"),
    ],
  },
  EMPLOYEE: {
    label: "Karyawan",
    fields: [
      f("position", "Jabatan", "text", true),
      f("workId", "ID karyawan"),
      f("department", "Nama departemen"),
      f("departmentId", "Master departemen", "select", false, {master:"DEPARTMENT"}),
      f("positionId", "Master jabatan", "select", false, {master:"POSITION"}),
      f("deploymentCode", "Kode penempatan"),
      f("resignedAt", "Tanggal resign", "date"),
      f("location", "Lokasi kerja"),
      f("joinedAt", "Tanggal bergabung", "date"),
      f("email", "Email kerja"),
      f("phone", "Telepon kerja"),
      f("certification", "Nama sertifikasi"),
      f("certificateNo", "Nomor sertifikat"),
      f("certificateExpiry", "Masa berlaku sertifikat", "date"),
      f("userId", "ID akun pengguna"),
    ],
  },
  WAREHOUSE: {
    label: "Gudang & lokasi",
    fields: [
      f("address", "Alamat", "textarea"),
      f("type", "Jenis lokasi", "select", true, {
        options: ["CENTRAL", "SITE", "OUTLET", "KITCHEN"],
      }),
    ],
  },
  PROJECT: {
    label: "Proyek & kontrak",
    fields: [
      f("partnerId", "Pelanggan", "select", false, { master: "PARTNER" }),
      f("cluster", "Klaster", "select", true, {
        options: ["CLEANING", "SECURITY", "CULINARY", "OTHER"],
      }),
      f("startAt", "Tanggal kontrak", "date"),
      f("dueDate", "Akhir kontrak", "date"),
      f("contractValue", "Nilai kontrak", "number"),
      f("slaTarget", "Target SLA (%)", "number"),
      f("address", "Alamat lokasi", "textarea"),
    ],
  },
  ASSET: {
    label: "Aset & perlengkapan",
    fields: [
      f("serial", "Nomor seri"),
      f("quantity", "Jumlah unit / kelompok", "number"),
      f("category", "Kategori"),
      f("brand", "Merk"),
      f("model", "Model"),
      f("condition", "Kondisi"),
      f("barcode", "Barcode aset"),
      f("custodian", "Pemegang aset"),
      f("location", "Lokasi"),
      f("acquiredAt", "Tanggal perolehan", "date"),
      f("cost", "Harga perolehan", "number"),
      f("nextMaintenance", "Servis berikutnya", "date"),
    ],
  },
  BOM: {
    label: "Resep / bill of materials",
    fields: [
      f("productId", "Produk hasil", "select", true, { master: "PRODUCT" }),
      f("outputQuantity", "Jumlah hasil standar", "number", true),
      f("ingredients", "Bahan baku per hasil standar", "textarea", true),
    ],
  },
};
export const financialModules = new Set([
  "cash-advance",
  "expenses",
  "sales",
  "purchase",
  "pos",
  "payments",
]);
export const operationalModules = new Set(
  definitions.filter((m) => m.fields.length || m.lines).map((m) => m.key),
);
