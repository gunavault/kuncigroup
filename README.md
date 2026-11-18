# Kunci Group ERP — rilis operasional v3

ERP kustom Next.js/PostgreSQL dengan 19 aplikasi, alur persetujuan, pembukuan berpasangan, dan pemisahan data perusahaan/cabang. Kajian Odoo digunakan sebagai referensi kebutuhan. Aplikasi ini bukan instalasi Odoo dan tidak menggunakan lisensi Odoo Enterprise.

Alamat publik sementara: **https://kunci-erp-45422633542.us-central1.run.app**. Login administrator: `admin@kuncigroup.cloud`; kata sandi tersimpan di file lokal `data/kunci-cloud-access.txt`, tidak di repositori atau dokumen ini. Semua data bisnis memerlukan login. Buka Settings untuk mengganti kata sandi dan membuat akun individu.

Pembaruan 18 November 2026: enam workbook unggahan telah diperiksa dan diintegrasikan, dengan 20.759 catatan sumber, roster 221 karyawan dan hierarki Administrator/Direktur/Manager/Staf/Karyawan. Lihat [LAPORAN_UJI_TUNTAS_V3.md](LAPORAN_UJI_TUNTAS_V3.md) untuk jumlah, pengecualian sumber, penggunaan layar, matriks akses dan hasil pengujian.

## Kemampuan aplikasi

| Aplikasi | Alur yang tersedia |
|---|---|
| Discuss | Kanal percakapan per perusahaan/cabang, notifikasi persetujuan, GPS, QC, keterlambatan, dan selisih kas |
| Cash Advance | Pengajuan, persetujuan terpisah dari pembuat, pencairan, pertanggungjawaban dan pengembalian sisa |
| Sales | Quotation/order/invoice, pelanggan/proyek, PPN efektif yang diisi Finance, piutang dan pembayaran parsial |
| Dashboards | Ringkasan dokumen, piutang/kasbon, laba rugi cabang dari jurnal bulan berjalan, ketepatan penyelesaian WO |
| Accounting | COA bersama, saldo awal, jurnal, buku besar, neraca saldo, penyesuaian, laporan, pembalik dan tutup buku |
| Purchase | RFQ/order/bill, pemasok, penerimaan persediaan, PPN masukan, utang dan pembayaran |
| Inventory | Gudang virtual/cabang, penerimaan, pengeluaran, transfer, lot, kedaluwarsa, FEFO dan valuasi dalam sen |
| Barcode | Kamera browser/USB/input manual, label Code128, pencarian lot/aset dan serah terima aset |
| Employees | Identitas kerja minimal, cabang, jabatan, tanggal masuk, sertifikasi dan masa berlaku |
| Expenses | Bukti PDF/JPEG/PNG, offset kasbon, utang penggantian biaya dan perlindungan pemakaian ulang ID bukti |
| Apps | Aktivasi/nonaktivasi modul per perusahaan dengan pemeriksaan dependensi |
| Settings | Akun individu, peran/cabang, perubahan kata sandi, perusahaan, geofence dan pemetaan akun |
| Point of Sale | Penjualan tunai/bank, stok/COGS, nama sif dan rekonsiliasi kas penjualan |
| Manufacturing | Resep/BOM, konsumsi bahan, lot hasil, biaya produksi dan konservasi nilai persediaan |
| Project | Master kontrak/proyek, WO, penanggung jawab, target, progres dan referensi BAST |
| Timesheets | Jam mulai/selesai, alokasi proyek, biaya indikatif dan penolakan jam bertumpang tindih |
| Attendances | Sif, GPS/akurasi, radius lokasi, pengecualian yang ditinjau, keterlambatan dan notifikasi |
| Quality | Checklist, suhu minimum/maksimum, hasil PASS/FAIL, karantina lot dan tindakan koreksi sebelum pelepasan |
| Maintenance | Jadwal preventif/korektif, hasil servis, utang biaya dan tanggal servis berikutnya |

Pembayaran, serah terima aset, jadwal sif dan tutup sif POS tersedia sebagai alur pendukung. Dokumen transaksi dapat diunduh sebagai PDF; laporan keuangan tersedia dalam PDF/XLSX.

## Baseline sumber Drive v2 dan kehati-hatian pembukuan

Sumber: https://drive.google.com/drive/folders/1-bFBlxQLh41BbWvT7be4evYZt7xTkj4X

- 15.129 entri metadata (termasuk folder), seluruh folder terdeteksi telah ditelusuri. Tiga folder dibatasi konektor pada 100 anak; indeks ditandai parsial.
- 12 workbook dipilih dan dinormalisasi dengan jejak file, sheet, baris, hash sumber dan fingerprint impor.
- 86 akun bernama, 931 master, 937 dokumen historis dan 3.137 baris pemeriksaan. Empat kode akun tanpa nama tetap dalam antrean pemeriksaan.
- KBA, KCG, KCL dibuat sebagai perusahaan operasional; KBL disimpan nonaktif karena nama legal belum diverifikasi. DEMO terpisah untuk latihan siklus akuntansi.
- **Isi seluruh 15.129 entri belum diekstrak.** Berkas lain baru diindeks. Foto identitas, data keluarga, rekening pribadi, kredensial, dan dokumen medis tidak disalin sebagai master karyawan.
- Master impor harus ditinjau/disimpan. Dokumen berstatus `IMPORTED` harus dilengkapi dan diberi catatan verifikasi sebelum menjadi draft. Tidak ada posting otomatis.
- Daftar stok tahun 2024 dan RAB menjadi katalog referensi, bukan stok tersedia saat ini. Saldo awal kosong tidak direka. Invoice sumber tidak otomatis dianggap piutang terutang atau pembayaran terkonfirmasi.
- Pemetaan akun, nama legal, tanggal ambigu, nomor invoice ganda, PPN/PPh, sisa kasbon, saldo awal dan cut-off harus diverifikasi Finance sebelum pembukuan resmi.

Lihat [PANDUAN_OPERASIONAL.md](PANDUAN_OPERASIONAL.md) untuk urutan penggunaan dan batas integrasi.

**Untuk agen AI / developer baru:** mulai dari [AGENTS.md](AGENTS.md). Isinya peta kode, perintah, invariant yang tidak boleh dilanggar, skrip yang tidak boleh dijalankan ulang, aturan rahasia, dan cara memakai Context7 (dikonfigurasi di [.mcp.json](.mcp.json)) untuk dokumentasi Next.js 16, Prisma 6 dan library lain.

## Kontrol data

Uang dihitung sebagai bigint sen dan disimpan Decimal(15,2); kuantitas maksimum tiga desimal. Posting berjalan atomik dengan penguncian perusahaan dan retry konflik serialisasi. Jurnal posted seimbang, tidak dapat diedit/dihapus, dan audit/stock movement append-only. Periode perusahaan independen; tutup buku menolak transaksi operasional yang belum selesai.

Sembilan peran: ADMIN, DIRECTOR, MANAGER, FINANCE, HR, SUPERVISOR, STAFF, EMPLOYEE, AUDITOR. Atasan, kaitan karyawan dan status akses diatur per perusahaan. Data dan referensi disaring per perusahaan/cabang; staf hanya melihat dokumennya sendiri dan data personel yang ditautkan ke akunnya. Register sumber/impor memerlukan cakupan perusahaan dan sumber HR dibatasi. Akun baru wajib mengganti kata sandi awal. Sesi opaque disimpan sebagai hash, kedaluwarsa 8 jam, cookie HttpOnly/Secure/SameSite Strict, dicabut saat logout/perubahan akses/kata sandi.

Administrator pemilik dapat menyetujui dokumennya sendiri sebagai pengecualian bootstrap. Gunakan akun individu untuk pemisahan pembuat/pemeriksa. Superuser dan administrator database tetap memiliki akses luas; pemisahan diterapkan di lapisan aplikasi, bukan PostgreSQL RLS.

## Pengembangan lokal

Node.js 24+, npm, PostgreSQL. Pada PowerShell gunakan `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run db:local
# Terminal kedua, setelah database siap:
npm.cmd run db:migrate
npm.cmd run db:seed
# Impor hanya jika berkas privat data/drive-normalized.json dan indeks tersedia:
npx.cmd tsx scripts/import-drive.ts
npm.cmd run dev
```

`db:local` aman dijalankan ulang: bila PostgreSQL sudah aktif di 127.0.0.1:55432, skrip hanya memberi tahu lalu keluar. Biarkan terminal `db:local` tetap terbuka selama aplikasi dipakai; tutup dengan Ctrl+C agar database berhenti bersih.

Dev tanpa APP_PASSWORD memberi administrator lokal dan hanya bind ke loopback. Produksi harus memiliki APP_PASSWORD acak minimal 16 karakter untuk bootstrap akun pertama. Kata sandi akun disimpan dengan scrypt; APP_PASSWORD tidak mereset akun yang telah ada. Jangan membagikan `.env`, database, unggahan atau folder data.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Pengujian database membuat/menghapus schema UUID sementara, bukan schema `public`. Memerlukan akun migrasi yang dapat membuat schema; jangan memakai akun runtime. 49 pemeriksaan telah lulus pada rilis ini. Smoke HTTP produksi juga memeriksa login, sesi, pembatasan API, impor, PDF, PNG barcode, isolasi buku besar dan CSRF. Uji kamera/GPS pada perangkat sebenarnya dan uji beban belum dilakukan; host browser otomatis pada sesi ini tidak tersedia.

## Operasi cloud

Project `kunci-group-erp-20261116`; VM `kunci-erp-pilot`, `us-central1-a`, `e2-micro`. HTTPS Google Cloud Run -> Nginx privat8081 -> Next.js loopback3000; SSH melalui IAP. Domain utama tidak diubah. IP publik statis dan penyimpanan cadangan memiliki biaya penggunaan; e2-micro ditujukan untuk pilot dengan pengguna terbatas.

Paket kode mengecualikan `.env`, kredensial, database, unggahan dan data sumber. Impor minimal dikirim sebagai paket privat terpisah. Script upgrade membuat cadangan awal, menerapkan migrasi, mengimpor secara idempoten, menjalankan tes, build dan restart service.

Cadangan harian pukul 01.17 WIB meliputi database dan unggahan; lokal 7 hari, bucket privat `kunci-group-erp-backups-20261116` 14 hari. Akun layanan VM hanya memiliki `storage.objectCreator` pada bucket itu dan tidak memakai kunci JSON. Lihat [deploy/README.md](deploy/README.md) untuk pemulihan dan pemeriksaan.

## Batas rilis

Belum tersambung: Odoo, bank, faktur pajak, payroll, mesin sidik jari, IoT suhu, layanan email, maupun agregator food delivery. POS saat ini kasir berbasis dokumen dengan approval, bukan terminal restoran offline berkecepatan tinggi. GPS browser dan input suhu memerlukan pemeriksaan operasional; tidak menyediakan bukti anti-spoofing. Laporan konsolidasi/eliminasi antarperusahaan dan multi-currency belum tersedia.

Sistem menyediakan alur yang dapat diuji; belum merupakan sertifikasi kepatuhan, hasil UAT Finance, atau jaminan seluruh dokumen Drive benar. Data yang belum diverifikasi tetap terlihat jelas sebagai pekerjaan tersisa.
