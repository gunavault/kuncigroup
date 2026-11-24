# Laporan v6: buku besar, laporan keuangan, laporan manajemen dan dashboard

Tanggal: 23 November 2026. Perusahaan: **PT Kunci Berkah Abadi (KBA)**. Basis: *Kertas Kerja Akuntansi KBA 2026*, sheet JURNAL. Status: **belum diaudit**.

## 1. Alur yang dijalankan

1. **Bukti transaksi → voucher.** Kertas kerja telah mengelompokkan 1.688 bukti sumber (TRS, INV dan lainnya) ke dalam 2.000 voucher (JV-*), terdiri dari 4.245 baris jurnal untuk Januari–Oktober 2026.
2. **Validasi sebelum posting** (`scripts/post-working-paper-kba-2026.ts`, dry-run default). Hasilnya:
   - Setiap voucher memiliki satu tanggal dan seimbang.
   - Semua akun terdaftar di COA, setelah tiga akun penampung kertas kerja (99901–99903) ditambahkan apa adanya.
   - Tidak ada tanggal di luar jendela posting.
   - Tidak ada periode yang tumpang tindih.
3. **Penjurnalan.** Setiap voucher diposting melalui mesin jurnal ERP yang sama dengan transaksi harian (`accounting.insert`). Mesin itu menegakkan keseimbangan, akun aktif, dan aktivitas arus kas wajib untuk transaksi kas.
   - JV-SA → saldo awal (OPENING).
   - JV-AJ → penyesuaian (ADJUSTING).
   - Selainnya → jurnal umum.
   - Aktivitas arus kas diambil dari tag akuntan pada kolom 12:
     - OPS-* dan KAS-INTERNAL → operasi;
     - INV-ASET → investasi;
     - FIN-* dan PNP-PINJAMAN → pendanaan;
     - PNP-TIDAKDIKENAL → operasi, sampai penerimanya teridentifikasi (temuan T06).
   - Voucher berlabel **ESTIMASI** (2 AJP) dan **PENAMPUNG** (65 voucher) dapat difilter di register jurnal.
4. **Buku besar dan neraca saldo.** Periode KBA "Januari s.d. Oktober 2026 (kertas kerja)" tetap **terbuka**, sehingga koreksi atas temuan dapat dicatat sebagai jurnal penyesuaian di periode yang sama.
   - Saat Finance menutup periode, saldo dibawa ke periode November yang sudah ada.
   - Dokumen impor yang tercakup kertas kerja tidak menghalangi penutupan.
5. **Laporan.**
   - **Laporan keuangan** (Accounting → Laporan keuangan; PDF/Excel): laba rugi, neraca, perubahan ekuitas dan arus kas.
   - **Laporan manajemen** (Accounting → Laporan manajemen; PDF/Excel): laba rugi bertingkat, tren bulanan, posisi, arus kas, biaya terbesar, narasi otomatis, 31 temuan dan status 33 uji kontrol.
6. **Dashboard.**
   - **Makro:** ringkasan keuangan Accounting dan dashboard laba rugi per cabang. Bila bulan berjalan belum berisi jurnal, dashboard menampilkan bulan terakhir yang sudah dibukukan, dengan keterangan.
   - **Mikro:** kartu per modul, misalnya Accounting dan Dashboards dengan jurnal, debit/kredit dan laba rugi buku besar.

## 2. Rekonsiliasi terhadap kontrol kertas kerja

Seluruh uji berikut **cocok** dengan kontrol kertas kerja (CEK) dan angka statusnya:

| Uji | Hasil |
|---|---|
| Jumlah voucher (2.000) dan baris bernilai; baris bernilai nol tidak dijurnal | Cocok |
| Total mutasi debit = kredit (C02) | Cocok |
| Neraca saldo seimbang (C05) | Cocok |
| Neraca: aset = liabilitas + ekuitas (C07) | Selisih nol |
| Arus kas: kas awal + arus = kas akhir (C11) | Selisih nol |
| Saldo akun penampung = status penampung kertas kerja | Cocok sampai sen |
| Saldo akun estimasi tenaga kerja = status estimasi kertas kerja | Cocok sampai sen |

## 3. Angka laporan

Nominal laporan **tidak dicantumkan di repositori ini** karena repositori bersifat publik. Angka tersedia di aplikasi (wajib login):
- Accounting → Laporan keuangan;
- Accounting → Laporan manajemen, termasuk unduhan PDF/Excel.

Ringkasan angka untuk pemeriksaan internal disimpan di `data/laporan-keuangan-v6-angka.md`, yang tidak ikut git.

Catatan kualitatif:
- **Estimasi.** Laporan memuat estimasi beban tenaga kerja (temuan T01) dan PPh badan. Hasil bulan Oktober terutama dipengaruhi AJP estimasi yang dicatat pada bulan itu.
- **Akun penampung.** Masih bersaldo (temuan T05/T06) dan menunggu identifikasi.
- **Status laporan.** Ini laporan internal untuk manajemen, bukan laporan keuangan final atau teraudit.

## 4. Pengaman

- **Tidak ada dobel hitung.** Dokumen operasional berdampak buku besar yang bertanggal 1 Januari s.d. 31 Oktober 2026 ditolak saat diposting, karena periode itu sudah dibukukan dari kertas kerja. Contohnya 238 invoice penjualan dan 392 kasbon KBA yang berstatus IMPORTED.
- **Tidak dobel posting.** Skrip posting tidak dapat dijalankan dua kali (`historicalLedger` tercatat di pengaturan perusahaan). Setiap baris sumber ditautkan ke nomor jurnalnya.
- **Jurnal terkunci.** Jurnal yang sudah diposting tidak dapat diedit atau dihapus. Koreksi dilakukan dengan jurnal penyesuaian atau jurnal balik.

## 5. Batas

- **KCG dan KCL belum memiliki buku besar.** Tidak ada kertas kerja jurnal atau saldo awal untuk kedua perusahaan itu. Laporan manajemen menyatakan hal ini. Dokumen impornya (207 penjualan KCG, 100 kasbon KCL) tetap menunggu verifikasi dan tidak diposting otomatis.
- **November 2026 dan seterusnya** diisi dari transaksi operasional ERP yang diverifikasi dan diposting.
- **31 temuan** harus ditindaklanjuti sebelum laporan dinyatakan final. 14 di antaranya berstatus T (tinggi), misalnya payroll aktual, rekonsiliasi rekening koran, pinjaman tanpa utang tercatat, dan penerima tidak teridentifikasi.
- **UAT Finance** (pencocokan sampel voucher dengan bukti fisik) belum dilakukan.

## 6. Pengujian

| Tingkat | Hasil |
|---|---|
| Unit | Perencanaan voucher, tag arus kas, jendela historis, pengelompokan akun laporan manajemen: lulus |
| Integrasi DB | 83 tes; termasuk penolakan posting di dalam jendela historis dan penutupan ke periode berikutnya yang sudah ada: lulus |
| Rekonsiliasi | Seluruh uji pada bagian 2: cocok |
| SIT browser lokal (`scripts/qa-ui-v6.mjs`) | 6 pemeriksaan: periode default, KPI, laporan keuangan, laporan manajemen, ekspor PDF/Excel, dashboard bulan terakhir: lulus |
| PAT produksi (23 November 2026) | Deploy `v6-21e32e3`: 83/83 tes di VM. Uji coba posting identik dengan lokal, lalu posting 2.000 voucher; penolakan posting ulang terbukti. Sembilan angka kunci produksi sama persis dengan lokal. QA browser v6 (6) dan v4 (4), smoke v3 dan v4 terhadap URL publik: lulus |

## 7. Finalisasi laporan (v6.1)

Laporan periode kertas kerja berstatus **DRAFT** sampai seluruh syarat berikut terbukti dari data. Status tercetak di layar, PDF dan Excel.

| Syarat | Cara memenuhi | Bukti yang dibutuhkan |
|---|---|---|
| Neraca saldo, neraca dan arus kas seimbang | Otomatis | Lulus |
| Tidak ada jurnal draft | Otomatis | Lulus |
| Akun estimasi bersaldo nol (21111, 21112) | Jurnal penyesuaian: balik estimasi, lalu bukukan payroll aktual per bulan/proyek (gaji bruto, BPJS, PPh 21) dan PPh badan aktual | Rekap payroll bruto Januari–Oktober 2026 per proyek, rekap iuran BPJS, SPT Masa PPh 21, perhitungan PPh badan |
| Akun penampung bersaldo nol (99901–99903) | Reklasifikasi ke utang pinjaman/afiliasi/beban sesuai dokumen | Perjanjian pinjaman/gadai/investor (T05), identitas dan dasar pembayaran penerima (T06), rekonsiliasi selisih saldo awal (T03) |
| Temuan tingkat T selesai atau risikonya diterima Direksi | Perbarui status di panel Finalisasi. Temuan T wajib disertai bukti. Penerimaan risiko hanya oleh Direksi/Administrator | Sesuai kolom "Tindakan" setiap temuan |
| Sign-off Finance | Tombol "Sign-off Finance" setelah syarat substantif lulus | Pemeriksaan sampel voucher terhadap bukti fisik (UAT) |
| Persetujuan Direksi | Tombol "Persetujuan Direksi", oleh orang yang berbeda dari Finance | — |
| Periode ditutup | Tutup buku. Ditolak sampai syarat di atas lulus, kecuali ada pengecualian Direksi yang dicatat | — |

Aturan:
- Setiap perubahan temuan setelah sign-off membatalkan sign-off.
- Laporan dengan pengecualian Direksi berstatus **FINAL DENGAN PENGECUALIAN**.
- Semua aksi finalisasi tercatat di jejak audit.

**Bukti yang ditemukan di Drive (23–24 November 2026):**
- Bukti transfer gaji **neto** dari rekening Mandiri payroll untuk **Januari–Juni 2026**: HO, Halim, KLH, Retail, individual, dan THR Maret. GOR hanya April–Juni.
  - Bukti ini menunjukkan kas yang dibayar, bukan beban bruto (BPJS dan PPh 21 tidak ada).
  - **Juli–Oktober 2026 tidak ditemukan.**
  - Bukti ini belum cukup untuk mengganti estimasi T01, tetapi berguna untuk rekonsiliasi rekening koran payroll (T02).
- Jurnal rekening koran Mandiri **2025**. Relevan untuk T03, bukan untuk periode 2026.
- Perjanjian pinjaman/gadai/investor (T05) dan identitas penerima (T06): **tidak ditemukan**.

Laporan tidak dinyatakan final oleh sistem atau agen. Status FINAL hanya muncul setelah bukti di atas dibukukan dan dua pejabat yang berwenang menandatanganinya di aplikasi.
