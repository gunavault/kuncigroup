# Panduan operasional Kunci Group ERP

Alamat masuk: https://kunci-erp-45422633542.us-central1.run.app. Semua langkah berikut dilakukan setelah login. Pilih perusahaan, kemudian cabang yang sesuai. Data DEMO hanya untuk latihan; jangan memakai jurnal DEMO untuk pembukuan KBA/KCG/KCL.

## 1. Persiapan administrator dan Finance

1. Settings: ubah kata sandi administrator; buat akun individu minimal 16 karakter. Pengguna baru diminta mengganti kata sandi saat login pertama.
2. Atur peran dan cabang melalui Hak Akses Perusahaan. Kosong berarti seluruh perusahaan; pembatasan cabang harus dipilih secara sadar. Perubahan akses mencabut sesi pengguna.
3. Periksa nama legal, cabang dan alamat. Isi latitude/longitude serta radius sesuai lokasi proyek/outlet sebenarnya; koordinat sumber tidak diasumsikan.
4. Finance meninjau pemetaan akun: kas/bank, AR/AP, pendapatan, persediaan, kasbon, beban/HPP, pajak masukan/keluaran, PPh dibayar di muka/utang pajak dan akun penyeimbang stok.
5. Periksa COA bersama dan saldo awal melalui Accounting. Jangan memasukkan jurnal saldo awal jika belum ada neraca saldo yang disahkan dan cut-off yang jelas.
6. Verifikasi master pelanggan/pemasok, personel, barang/jasa, gudang, proyek, aset dan resep. Barang persediaan harus memiliki satuan; bahan kedaluwarsa wajib mengaktifkan pelacakan lot/expiry sebelum mutasi pertama.

## 2. Memeriksa hasil impor Drive

Register Sumber menampilkan metadata dan tautan Drive dengan izin Drive masing-masing pengguna. `INDEXED` berarti metadata, bukan isi terolah. `PARSED` berarti workbook telah dipetakan, bukan transaksi telah disahkan. `PARTIAL_INDEX` menunjukkan folder yang daftar anaknya terbatas 100 item. `RESTRICTED` tidak membuka dokumen kredensial.

Verifikasi Impor menampilkan sheet/baris, jenis target dan masalah. Buka master atau dokumen target, bandingkan dengan sumber dan simpan koreksi. Master disimpan menjadi VERIFIED; transaksi menjadi DRAFT setelah catatan verifikasi minimal 10 karakter dan kolom wajib lengkap. Setelah itu ajukan, minta pemeriksa berbeda menyetujui, lalu Finance melakukan posting. Baris tanpa pemetaan dapat ditolak dengan alasan atau ditranskripsikan sebagai master/transaksi baru setelah sumber diperiksa; sertakan referensi sumber pada uraian.

Angka `0` di laporan perusahaan baru berarti belum ada jurnal yang diposting. Ini tidak menyatakan perusahaan tidak mempunyai aset, piutang, laba atau kewajiban. Stok historis/RAB menjadi katalog, bukan saldo tersedia. Tanggal/nominal ambigu dan rekening pembayaran harus diperiksa terhadap dokumen asli.

## 3. Kasbon dan klaim lapangan

Cash Advance: pilih personel dan cabang, proyek jika ada, tujuan, batas pertanggungjawaban dan rincian nilai. Simpan draft -> ajukan -> persetujuan pemeriksa -> posting Finance. Jurnal pencairan: debit kasbon, kredit kas.

Expenses: pilih karyawan yang sama dan cabang yang sama, isi nomor kasbon, proyek serta rincian biaya. Unggah struk PDF/PNG/JPEG hingga 5 MB. Posting mengurangi sisa kasbon; kelebihan klaim menjadi utang penggantian. ID bukti yang sudah dipakai klaim posted tidak dapat dipakai kembali. Perbedaan gambar/unggahan ganda tetap memerlukan pemeriksaan manusia.

Pembayaran: arah `PAY` untuk melunasi kelebihan klaim, `ADVANCE_RETURN` untuk pengembalian sisa kasbon. Masukkan nomor dokumen dan nilai kas aktual. Saldo tidak boleh terlampaui; penyelesaian memperbarui dokumen referensi secara atomik.

## 4. Penjualan, pembelian dan pajak

Sales mendukung quotation/order/invoice. Konfirmasi quotation/order tidak membentuk piutang atau jurnal. Untuk invoice, lengkapi pelanggan, tanggal/jatuh tempo, proyek, barang/jasa, gudang dan tarif PPN efektif yang telah ditinjau Finance. Barang stok mengurangi lot FEFO dan membentuk HPP.

Purchase mendukung RFQ/order/bill. RFQ/order tidak menambah stok atau utang. Bill barang stok menerima lot dan membentuk persediaan/utang; bill jasa membentuk beban/utang. Harga pada baris adalah sebelum pajak.

Menu Pembayaran tersedia di sidebar dan alur Sales/Purchase/Expenses/Cash Advance/Maintenance. `RECEIVE` melunasi invoice pelanggan; `PAY` melunasi tagihan pemasok/klaim/servis. Pembayaran boleh parsial. Jika ada potongan PPh, isi nilai kas neto, nilai PPh dan unggah bukti potong. Kas + PPh mengurangi saldo dokumen. Sistem tidak menghitung tarif PPh otomatis atau menerbitkan faktur pajak.

## 5. Gudang, barcode dan FEFO

Buat master WAREHOUSE per cabang (CENTRAL, SITE, OUTLET atau KITCHEN). Gunakan Inventory untuk penerimaan, pemakaian atau transfer. Penerimaan non-pembelian menggunakan akun penyeimbang persediaan yang harus direkonsiliasi Finance.

Barcode dapat membaca kamera ponsel pada HTTPS atau input scanner USB/manual. Pindai kode barang/aset atau nomor/ID lot. Periksa lokasi karena kode lot yang sama dapat ada di beberapa gudang. Label Code128 barang/aset dapat dicetak dari hasil pemindaian. Pada baris pengeluaran, isi lot yang dipindai; mesin posting memeriksa FEFO, tanggal kedaluwarsa, karantina dan kuantitas. Stok negatif dan backdate sebelum mutasi terakhir barang ditolak.

Transfer memerlukan akses ke gudang asal dan tujuan; nilai dipindahkan persis, tanpa laba/rugi. Aset dipindahkan melalui Serah Terima Aset: penerima, cabang, lokasi dan kondisi akan memperbarui master aset saat finalisasi.

## 6. Kuliner: POS, resep dan QC

POS: pilih cabang/outlet/gudang, nama sif, metode CASH/BANK dan barang/jasa. Selesaikan persetujuan/posting untuk membentuk penjualan, pajak dan HPP. Alur ini berbasis dokumen dan memerlukan koneksi; operasi kasir offline, meja restoran, printer fiskal dan food delivery belum tersambung.

Tutup Sif POS: selesaikan/batalkan semua draft sif, masukkan kas fisik hasil penjualan tanpa saldo awal. Sistem menghitung kas penjualan CASH, menyimpan selisih dan mewajibkan penjelasan jika berbeda. Sif yang ditutup tidak dapat menerima posting penjualan tambahan.

Manufacturing: buat master resep/BOM, pilih hasil dan satuan yang sesuai, isi bahan per hasil standar. Produksi mengonsumsi bahan FEFO dan menciptakan lot hasil dengan expiry; nilai bahan menjadi nilai produk hasil tanpa kehilangan sen pembulatan. BOM yang sudah dipakai disetujui/posted harus direvisi dengan kode baru.

Quality: isi checklist dan hasil PASS/FAIL; untuk lot bahan wajib memasukkan suhu terukur dan kedua batas. Suhu di luar rentang harus FAIL. Finalisasi FAIL mengarantina lot dan mengirim notifikasi. Pelepasan karantina memakai pemeriksaan PASS baru dengan tindakan koreksi minimal 10 karakter. Form ini tidak menggantikan penetapan batas HACCP oleh penanggung jawab kompeten.

## 7. Kebersihan/keamanan: proyek, sif, absensi, waktu kerja

Project: buat kontrak/lokasi dan target SLA, lalu WO dengan penanggung jawab, checklist dan target selesai. Finalisasi WO memerlukan progres 100% dan referensi BAST; waktu finalisasi menjadi waktu selesai aktual untuk dashboard.

Attendances -> Jadwal Sif: buat jadwal per personel/proyek/cabang; waktu disimpan sebagai UTC dan ditampilkan WIB. Jadwal tumpang tindih ditolak. Tautkan master karyawan ke ID akun staf melalui administrator/HR agar staf hanya mengajukan absensinya sendiri.

Absensi: pilih tanggal check-in WIB, ambil GPS atau masukkan data yang diperiksa, nomor sif dan check-out jika ada. Sistem menghitung radius beserta akurasi. GPS di luar radius/tidak terkonfigurasi memerlukan alasan pengecualian sebelum persetujuan. Keterlambatan dihitung terhadap sif dan dikirim ke Discuss. GPS browser dapat dipalsukan; supervisor tetap meninjau bukti lapangan. Integrasi mesin sidik jari belum aktif.

Timesheets: catat karyawan, proyek, jam dan uraian. Jam tumpang tindih dan durasi lebih 24 jam per catatan ditolak. Tarif per jam menghasilkan biaya indikatif; tidak otomatis menjadi payroll atau jurnal gaji.

Employees: isi sertifikasi, nomor dan masa berlaku; dashboard menandai sertifikat kedaluwarsa. Maintenance memperbarui jadwal servis aset dan membukukan biaya/utang jika ada nilai servis.

## 8. Pelaporan dan tutup buku

Dashboards menghormati filter cabang. Tabel laba rugi cabang memakai jurnal posted bulan berjalan WIB, sebelum PPN dan tanpa jurnal penutup. WO tepat waktu dibandingkan dengan seluruh WO bulan tersebut; bukan sertifikasi pemenuhan kontrak eksternal.

Accounting: tinjau jurnal, buku besar, neraca saldo, penyesuaian dan laporan. PDF/XLSX tersedia; setiap dokumen operasional juga memiliki PDF. Jurnal posted tidak dapat diubah; koreksi harus dicatat dengan referensi dan ditinjau Finance. Pembalik langsung jurnal yang berasal dari dokumen operasional ditolak untuk mencegah saldo subledger terputus.

Tutup buku hanya setelah semua dokumen periode selesai atau dibatalkan, rekonsiliasi AR/AP/kasbon/stok/pajak dan bukti telah diperiksa. Preview tidak mengubah data. Penutupan membentuk jurnal penutup, meneruskan akun permanen, dan mengunci periode. Angka laporan masa lalu tetap tersedia.

## 9. Penerimaan sebelum pemakaian penuh

Lakukan UAT Finance untuk saldo awal, cut-off, tarif pajak, sumber historis, nama legal dan pemetaan akun. Lakukan uji perangkat nyata untuk kamera, GPS, pencetakan label dan operasi outlet. Uji beban belum dilakukan untuk ribuan pengguna; VM e2-micro adalah kapasitas pilot. Integrasi eksternal memerlukan spesifikasi/API dan konfigurasi tersendiri.


## Pembaruan master data dan pengguna v3

Gunakan menu **Data unggahan** untuk menelusuri enam workbook, memfilter tanggal/cabang/status, meninjau rincian dan memadankan identitas absensi. Panel yang sama tersedia pada Employees, Attendances, Inventory dan Dashboards. Roster default berisi 221 karyawan per 17 November; referensi historis tersedia melalui pilihan cakupan.

Di Settings, gunakan **Hierarki & manajemen pengguna** untuk membuat username/email individual, menetapkan peran, atasan, cabang dan karyawan. Kata sandi awal wajib diganti. Hak baru dan penonaktifan mencabut sesi lama. Baca matriks akses dan langkah pemeriksaan saldo awal stok dalam [laporan uji tuntas v3](LAPORAN_UJI_TUNTAS_V3.md).

Jangan menjadikan angka sumber yang belum ditinjau sebagai ledger resmi. Ringkasan absensi, akun penampung, tanggal dan biaya unit yang belum terkonfirmasi tetap memerlukan keputusan HR/Finance.
