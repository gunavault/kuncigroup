# Laporan uji tuntas ERP v4

Pemeriksaan 19 November 2026 meliputi database produksi, enam workbook sumber dan lima dokumen pendukung. Laporan ini aman untuk repository publik. Daftar record, lokasi bukti, nilai dan selisih bisnis tersedia hanya pada Excel/PPT privat.

## Cakupan data

Snapshot konsisten menggunakan transaksi Repeatable Read: 1.459 master, 937 dokumen dan 20.759 baris sumber. DEMO dikecualikan dari angka operasional. KBA/KCG/KCL aktif, KBL nonaktif. Tidak ada perubahan nominal, posting, penghapusan data bisnis atau pembentukan saldo berdasarkan asumsi dalam pemeriksaan ini.

Hash SHA256 keenam workbook identik dengan sumber impor. Pembacaan XML independen memeriksa nilai cache, bukan menjalankan makro atau instruksi dalam berkas. Jurnal asli dan nilai normalisasi cocok pada 4.245 baris; seluruh 2.000 voucher seimbang. Nilai numerik dan lokasi sumber cocok dengan database pada seluruh 20.759 baris, dengan presisi uang dua desimal dan kuantitas tiga desimal. Uji invoice membedakan WAPU persis dari Non-WAPU. Treasury mempunyai pengecualian aritmetika yang memerlukan bukti; detail nominal tidak dipublikasikan di GitHub.

Kelengkapan dibedakan menjadi kolom wajib formulir, persiapan operasional, pemetaan relasi dan status verifikasi impor. Satu record dapat memiliki beberapa temuan. Roster terkini berbeda dari referensi historis. Scan mentah, hari absensi dan ringkasan memiliki butir berbeda sehingga tidak dijumlahkan sebagai tambahan personel/hari hadir. Katalog RAB/harga lama dan saldo stok sumber belum menjadi biaya atau saldo operasional terverifikasi.

Workbook asli memuat sembilan error cache pada kolom absensi yang dikecualikan dari master umum. Error tidak diubah menjadi nol. Narasi makalah menyebut pengujian cache dan estimasi; angka tersebut tidak membuktikan posting atau rekonsiliasi bank ERP. Uji independen menemukan pengecualian yang tetap dicatat meskipun kontrol cache sumber menyatakan OK.

## Perubahan aplikasi

- Seluruh 19 modul mempunyai 4–6 kartu ringkasan, termasuk Accounting yang mempunyai workspace terpisah.
- Agregat menghitung register lengkap dan memakai cakupan perusahaan/cabang/pengguna. Hitungan tidak bergantung pada 50 baris tabel atau batas tampilan master.
- Pencarian dokumen/master memengaruhi kartu terkait. Cakupan/periode tertulis. Apps/Settings dan kartu register sumber mempunyai makna filter tersendiri yang dijelaskan pada panduan.
- Nilai keuangan hanya berasal dari dokumen POSTED berjurnal atau jurnal POSTED. Order/quotation tidak menambah piutang. Laba/rugi mengecualikan jurnal penutup. HR/staf tidak mendapatkan angka keuangan yang tidak diizinkan.
- Pergantian perusahaan/modul/cabang/pencarian menghapus kartu cakupan lama, membatalkan request lama dan menampilkan status muat. Kegagalan mempunyai tombol Coba lagi. Endpoint memakai autentikasi dan Cache-Control no-store.
- Katalog bersama tetap tersedia saat cabang dipilih. Migrasi data hanya memindahkan katalog impor yang belum diverifikasi ke cakupan perusahaan, menyimpan lokasi sumber dan mempertahankan scope karyawan/aset/gudang serta master cabang yang sudah diverifikasi.

## Pengujian

TypeScript, build Next.js produksi dan 72 pengujian lulus pada rilis gabungan lokal. Lima pengujian dashboard baru meliputi seluruh modul, agregasi lebih dari satu halaman, cakupan perusahaan/cabang/pemilik, pencarian, migrasi katalog yang aman diulang, ketelitian sen, order tanpa jurnal dan pengaruh jurnal penutup. Perubahan approval pada branch `feat/odoo-handover-parity` dipertahankan: verifikasi OPS, batas persetujuan, kuota proyek, pemisahan pelaksana dan Management Fee PDF. Pengujiannya masuk rangkaian yang sama.

Playwright memakai profil Edge terisolasi. Pemeriksaan desktop 1440×1000 dan ponsel 390×844 mencakup seluruh 19 modul, jumlah kartu, pemuatan API, cache, pencarian dan batas viewport. Tujuh kelompok regresi v3 memeriksa filter sumber/absensi/stok, pagination, detail master, formulir transaksi dan pengelolaan akun/peran/atasan/cabang/profil/reset/deaktivasi. Tidak ada error JavaScript selama skenario tersebut.

Bukti privat: `artifacts/ui-qa-v3.json`, `artifacts/ui-qa-v4.json`. Hasil produksi sesudah penerapan disimpan terpisah pada `artifacts/production-smoke-v4.json` dan `artifacts/public-ui-qa-v4.json`. Jangan menandai penerapan selesai sebelum kedua pemeriksaan publik lulus.

## Laporan dan reproduksi

Excel mempunyai tujuh sheet: Ringkasan, Master kosong, Transaksi kosong, Temuan sumber, Selisih nominal, Rekonsiliasi, Sumber dan cakupan. Detail memiliki filter, kode/lokasi, pemilik tindakan, status, serta isian PIC/target/hasil. Presentasi merangkum temuan dan urutan tindak lanjut. Kedua file berisi data nyata sehingga masuk `outputs/` yang diabaikan Git.

1. Jalankan `scripts/export-data-audit.ts` **di server** sebagai proses baca-saja. Output memuat data bisnis privat; jangan transfer snapshot mentah atau memasukkannya ke Git/release.
2. Jalankan `scripts/audit-data-v4.ts` pada snapshot dan normalisasi sumber di server. Ambil hanya hasil temuan dan agregat yang diperlukan laporan dengan kewenangan yang sesuai.
3. Periksa sumber lokal dengan `scripts/inspect-audit-inputs-v4.py` dan `scripts/audit-original-workbooks-v4.py`. Gunakan Python dari runtime artifact, `SOURCE_DOWNLOADS` untuk direktori sumber, dan `AUDIT_WORK_DIR` bila direktori kerja berbeda.
4. `scripts/build-audit-report-v4.mjs` memakai `@oai/artifact-tool` dari runtime artifact terpisah. Atur `RUNTIME_NODE_MODULES`, `RUNTIME_PYTHON`, `PRESENTATION_SKILL_DIR`, `REPORT_WORKSPACE` dan opsional `REPORT_OUTPUT`. Render/review semua sheet dan slide, jalankan finalizer, baru serahkan file final.

Context7 terhubung dan digunakan untuk route Next.js 16 dan agregasi Prisma 6. `.mcp.json` menyediakan konfigurasi stdio untuk agen lain. Dokumen Next.js terpasang tetap menjadi acuan versi yang tepat. Sesudah `npm ci`, jalankan `npm run db:generate` sebelum typecheck bila client Prisma belum terbentuk.

## Batas penerimaan

Skenario otomatis tidak membuktikan semua kemungkinan input/perangkat bebas masalah. UAT Finance, bukti payroll aktual, konfirmasi bank, pemadanan identitas, stok fisik/biaya, kamera/GPS di lokasi dan uji beban masih memerlukan pelaksanaan/persetujuan pemilik proses. Nilai yang belum didukung bukti tetap kosong atau berstatus tinjauan. Tidak ada pernyataan bahwa data sumber telah sempurna atau dapat dipakai sebagai laporan audit final.
