# Laporan v5: penyesuaian master data dan pengujian

Tanggal: 19 November 2026. Basis kode: v4 (`codex/erp-v4-module-kpis-data-audit`), yang sudah memuat matriks persetujuan.

## 1. Evaluasi dua dokumen masukan

Kedua dokumen di bawah buatan AI. Isinya diperlakukan sebagai bahan yang harus diuji, bukan instruksi. Blok "super prompt" di dalamnya tidak dijalankan.

### `skema_database_postgresql_17_etl_staging_super_prompt_erp_kunci_group.sql`

| Usulan | Keputusan | Alasan |
|---|---|---|
| Skema baru `kunci_core`, `kunci_staging`, `kunci_audit` beserta tabel ala Odoo | **Ditolak** | ERP ini sudah memiliki model Prisma yang teruji (76 tes), batch impor, jejak sumber dan audit append-only. Skema paralel akan menggandakan sumber kebenaran. Kebutuhan fungsionalnya dipetakan ke model yang ada. |
| `INSERT res_company` untuk KCL sebagai "PT Kunci Cipta Lestari" dengan NPWP `0000000000000000` | **Ditolak** | Database memuat nama legal KCL "PT Kunci Cahaya Langit" dari sumber Drive (`legalNameSource`). NPWP nol adalah placeholder. Kajian pendamping sendiri ragu antara "Cipta Lestari" dan "Boga Lestari". |
| Default batas PO Rp10 juta (Manager) dan Rp50 juta (GM) | **Tidak diterapkan otomatis** | Angka ini tidak bersumber dari keputusan manajemen. Batas diisi pemilik di Settings → Matriks persetujuan. |
| `hr_employee` berisi NIK KTP, rekening bank, gaji pokok, BPJS dan PTKP | **Ditolak** | Bertentangan dengan prinsip minimisasi data (UU 27/2022 Pasal 16) dan aturan proyek. Data payroll tetap berada di sistem payroll, bukan master ERP umum. |
| Status PKWT/PKWTT dan tanggal kontrak (PP 35/2021) | **Diterapkan** | Kolom baru pada master karyawan, dengan validasi dan peringatan di dashboard. |
| Aset: ruang lingkup HO/Proyek dan kelompok harta fiskal (PMK 72/2023) | **Diterapkan** | Kolom baru. Ruang lingkup diisi dari jejak sumber; kelompok fiskal diisi Finance. |
| `purchase_qty_limit`, FR-CA-003, gerbang SoD, flag management fee | **Sudah ada** | Diterapkan di v4: matriks persetujuan, kuota proyek, satu kasbon terbuka, pemisahan peran, seksi management fee pada PDF. |
| Trigger FR-CA-003 di tabel kasbon | **Setara di aplikasi** | Pada usulan SQL, kasbon *disbursed* dianggap selesai bila statusnya `settled`. ERP ini lebih ketat: kasbon tetap terbuka sampai nilainya habis dipertanggungjawabkan atau dikembalikan. |
| `account_tax` dengan DPP 11/12 | **Tidak diubah** | PPN efektif tetap diisi Finance per dokumen. Tarif efektif 11% untuk barang non-mewah sesuai PMK 131/2024 sudah dijelaskan di kajian paritas. |
| Log MCP immutable | **Ditunda** | Server MCP tidak direkomendasikan sebelum ada kajian keamanan (lihat kajian paritas). |

### `kajian_audit_lintas_dokumen_evaluasi_regulasi_tata_kelola_data_erp_kunci_group.md`

- **"Keenam workbook terbaca kosong (zero-text)."** Ini berlaku untuk alat ekstraksi AI tersebut, bukan untuk ERP ini. Keenam workbook sudah diekstrak penuh di v3: 20.759 catatan sumber, 221 roster, 190 snapshot stok, 4.245 baris jurnal sumber.
- **"Treasury Master List"** ditemukan di Drive. File ini adalah spreadsheet hidup milik tim Treasury yang masih diedit dan menurut kajian memuat nomor rekening.
  - Tidak diimpor. Snapshot sekali jalan akan cepat basi dan memindahkan data rekening ke ERP.
  - Angka total yang dikutip kajian (ajuan Rp8.128.557.792, terbayar Rp7.571.196.390) **belum diverifikasi**.
  - Rekomendasi: integrasi resmi dengan Treasury, termasuk keputusan pemilik data.
- **Klaim regulasi** sebagian besar sejalan dengan rujukan umum: PP 35/2021, PP 36/2021, PSAK 202/216/115, PMK 131/2024, UU PDP. Rinciannya tetap perlu dikonfirmasi HR, Finance dan konsultan pajak.
  - Contoh tarif BPJS (4% pemberi kerja, 1% pekerja untuk BPJS Kesehatan) adalah aturan payroll yang tidak dihitung ERP ini.
- **Siklus absensi 20 s.d. 19** dicatat sebagai kebutuhan. Data v3 menyimpan rekap per periode sumber (September–Oktober 2026), bukan kalender penuh.

## 2. Pemeriksaan silang transaksi

Nilai invoice di Manual Guide (database uji Odoo `kunci13`) dicocokkan dengan penjualan yang sudah diimpor:

| Invoice di manual | Nilai terlihat | Ada di ERP? |
|---|---|---|
| INV/2026/00007 PT Kunci Boga Lestari, 13 April | 2.340.000 | **Ya** (KBA, 2026-04-13) |
| INV/2026/00001 PT Garuda Maintenance Facility | 97.215.019,… (terpotong) | Tidak |
| INV/2026/00002 KUFPEC Indonesia | 2.445.300 | Tidak |
| INV/2026/00003, 00004, 00008 KLH | 119.597.37… (terpotong) | Tidak |
| INV/2026/00005, 00006 Pemkot Bekasi Dispora | 1.059.567,… (terpotong) | Tidak |
| INV/2026/00010 KLH Bonas/Rumdin, Mei | 16.826.785,98 | Tidak |

**Tidak ada transaksi yang dibuat dari tangkapan layar.** Nilainya terpotong, sumbernya database uji, dan status pembayarannya tidak dapat dipastikan. Finance perlu mengekspor daftar invoice resmi dari Odoo produksi (`kunci_prod_db`) atau dari arsip faktur pajak. Setelah itu data dapat diimpor sebagai dokumen `IMPORTED` yang wajib diverifikasi.

## 3. Perubahan master data (v5)

Skrip `scripts/enrich-master-v5.ts` bersifat idempoten: dry-run secara default, menulis hanya dengan `--apply`, dan mencatat audit per perubahan. Skrip ini hanya mengisi nilai yang terbukti dari data:

| Perubahan | Jumlah (lokal) | Dasar |
|---|---:|---|
| `assetScope = HEAD_OFFICE` | 182 | Jejak sumber: Master Data Aset Head Office - KBA.xlsx |
| `assetScope = PROJECT` | 29 | Jejak sumber: Master Data Asset - Project.xlsx |
| Aset tanpa sumber yang membuktikan | 66 | Tidak diisi; ditinjau manual |
| Kode Odoo pada gudang | KLHP, KLHB, KBAHG | Nama cocok dengan tepat satu lokasi Odoo di Manual Guide hlm. 29 |
| Gudang baru KBAHO "Gudang Kantor Pusat KBA" | 1 (PENDING) | Lokasi Odoo KBAHO/Stock belum ada di ERP |

Hal yang perlu diputuskan Operasional:

- **Kemungkinan duplikat.** "Gudang Halim / Pandawa" dengan "Lokasi HALIM - PANDAWA" (KBAHP), dan "Gudang SKD 17" dengan "Lokasi HALIM - SKD 17" (KBAHS). Pilih satu master; nonaktifkan yang lain.
- **KBAR (Retail).** Bisa berarti "Lokasi HALIM - RETAIL" atau "Lokasi Gor - Retail".
- **Lokasi GOR di Odoo yang belum ada di ERP:** KBAGC (CSO), KBAGT (Teknisi), KBAGS (Stadion), KBAGG (Gardener), KBAGA (Admin). Konfirmasi apakah termasuk "GOR Candrabhaga" sebelum dibuat.

Kolom master baru:
- **Karyawan:** status hubungan kerja (PKWTT/PKWT/harian lepas/magang/alih daya), mulai kontrak dan akhir kontrak. PKWT wajib memiliki tanggal akhir dan jangka waktunya maksimal 5 tahun.
- **Aset:** ruang lingkup dan kelompok harta fiskal.
- **Gudang:** kode lokasi Odoo.
- **Partner:** PKP. Partner PKP wajib memiliki NPWP/NITKU.

Dashboard Employees menampilkan **Kontrak habis dalam 30 hari** dan **Sertifikat habis dalam 30 hari**.

## 4. Pengujian

| Tingkat | Cakupan | Hasil |
|---|---|---|
| Unit | Aturan persetujuan, NPWP, pengelompokan management fee, rencana pengayaan, aturan PKWT/PKP | Lulus |
| Integrasi (DB) | 76 tes, termasuk siklus transaksi, matriks persetujuan, kuota, FR-CA-003, isolasi perusahaan/cabang | Lulus (lokal; diulang di VM saat deploy) |
| SIT lokal | UI browser v4: 19 dashboard modul, cakupan cabang, pencarian, tampilan seluler 390px; API kartu karyawan, kode gudang, ruang lingkup aset | Lulus |
| PAT (produksi) | Deploy `v5-ce7d270`: 76/76 tes di VM; dry-run pengayaan identik dengan lokal, apply, lalu run ulang tanpa perubahan; smoke v3 dan v4 serta UI browser v4 terhadap URL publik | Lulus (19 November 2026, 09.00 UTC) |
| UAT | Memerlukan pengguna Finance/HR/Operasional. Skrip di bawah | **Belum dilakukan.** Tidak dapat digantikan agen |

### Skrip UAT (diisi pengguna bisnis)

1. Owner: isi Matriks persetujuan Purchase (verifikasi OPS aktif, batas Manager/Direktur sesuai kebijakan).
2. Staf: buat Purchase Request → Manager OPS verifikasi → Manager/Direktur setujui sesuai nilai → Finance posting tagihan. Pastikan orang yang sama ditolak pada tahap berikutnya.
3. Buat kuota proyek; ajukan PO melebihi kuota; pastikan ditolak, lalu override oleh Administrator dengan alasan.
4. Ajukan dua kasbon untuk karyawan yang sama; yang kedua harus ditolak sampai yang pertama selesai.
5. HR: isi status PKWT dan tanggal kontrak untuk 3 karyawan; periksa peringatan di dashboard Employees.
6. Finance: tetapkan kelompok harta fiskal untuk sampel 10 aset HO dan 5 aset proyek; cocokkan dengan register fiskal.
7. Operasional: putuskan duplikat gudang dan lokasi GOR (bagian 3), lalu verifikasi master KBAHO.
8. Finance: cetak PDF invoice dengan barang management fee; periksa subtotal per seksi.

Setiap langkah dicatat lulus/gagal beserta nama penguji dan tanggal.
