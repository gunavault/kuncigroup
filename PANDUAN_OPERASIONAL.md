# Panduan operasional Kunci Group ERP

Alamat masuk: https://kunci-erp-45422633542.us-central1.run.app. Semua langkah berikut dilakukan setelah login. Pilih perusahaan, kemudian cabang yang sesuai. Data DEMO hanya untuk latihan; jangan memakai jurnal DEMO untuk pembukuan KBA/KCG/KCL.

## Ringkasan pada setiap modul

Di atas setiap modul terdapat 4–6 kartu. Kartu menghitung seluruh register dalam hak akses, termasuk baris di halaman tabel berikutnya. Pilih perusahaan dan cabang sebelum membaca angka. Katalog barang/jasa, partner dan referensi organisasi yang ditetapkan bersama tetap tersedia saat memilih cabang; karyawan, gudang, aset dan saldo stok tetap mengikuti lokasi.

Kartu dokumen mengikuti pencarian nomor/judul. Kartu master mengikuti nama/kode. Apps dan Settings merangkum konfigurasi, bukan hasil pencarian dokumen. Kartu absensi sumber berlabel seluruh tanggal dan terpisah dari filter register sumber di bawahnya. Accounting mengikuti periode fiskal terpilih; kartu laba buku besar pada Dashboards mencakup seluruh periode dan mengecualikan jurnal penutup. Panel analitik bulanan di bawahnya tetap berlabel bulan berjalan.

Nilai piutang/kasbon/utang hanya menghitung dokumen POSTED yang mempunyai jurnal. Quotation/order yang dikonfirmasi tidak menambah nilai tersebut. Tanda — berarti hak akses belum mengizinkan nilai itu. Angka 0 berarti tidak ada data dalam cakupan yang dipilih. Saat memuat atau gagal, kartu menunjukkan status dan tombol Coba lagi.

Rekap kekosongan Excel memuat kode dokumen/master, kolom yang belum lengkap, dasar pemeriksaan, prioritas, pemilik tindakan dan lokasi sumber. Gunakan filter untuk membedakan kolom wajib, persiapan operasional dan status impor. Isi PIC, target dan hasil tindak lanjut pada kolom kuning. Kosong dan selisih sumber harus dibuktikan, bukan diganti dengan nilai perkiraan.

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

## Matriks persetujuan, verifikasi OPS dan kuota proyek

Pemilik (akun superuser) mengatur **Settings → Perusahaan → Matriks persetujuan** per modul Purchase, Pembayaran, Cash Advance dan Expenses:

- **Wajib verifikasi OPS**: setelah diajukan, dokumen menunggu tombol **Verifikasi OPS** dari Supervisor/Manager/Direktur/Administrator yang bukan pembuat. Tombol **Setujui** baru aktif setelah verifikasi.
- **Batas Manager / Batas Direktur (IDR, termasuk pajak)**: nilai ≤ batas Manager disetujui Manager; ≤ batas Direktur disetujui Direktur; di atasnya hanya Administrator/BOD. Kosongkan kedua batas untuk persetujuan satu tingkat seperti sebelumnya. Finance tidak menyetujui dokumen bertingkat; Finance memposting.
- Pembuat, verifikator OPS, pemberi persetujuan dan pemosting jurnal harus orang berbeda (pengecualian hanya akun pemilik untuk bootstrap).

Alur pembelian yang disarankan: **REQUEST** (Permintaan Pembelian dari lapangan; pemasok boleh kosong; tidak membentuk jurnal) → **RFQ** → **ORDER** (PO; diverifikasi OPS dan disetujui sesuai batas) → penerimaan barang → **BILL** (tagihan, diposting Finance) → **Pembayaran** (dapat diberi batas persetujuan terpisah sebagai otorisasi pencairan BOD).

**Kuota pembelian proyek**: buat master *Kuota pembelian proyek* (proyek, barang, kuantitas maksimum, periode). Saat PO (ORDER) dengan proyek tersebut disetujui, kuantitas PO yang sudah disetujui/diposting dijumlahkan. Bila melebihi sisa kuota, persetujuan ditolak dengan pesan "Melebihi batasan permintaan". Administrator dapat melakukan override dengan alasan minimal 10 karakter; alasan dan rincian kuota tercatat di dokumen dan jejak audit. Tagihan (BILL) tidak dihitung agar PO dan tagihannya tidak terhitung ganda.

**Kasbon (FR-CA-003)**: pemegang kasbon tidak dapat mengajukan kasbon baru selama masih ada kasbon yang diajukan, disetujui, atau sudah dicairkan tetapi belum habis dipertanggungjawabkan/dikembalikan.

**Management fee**: centang *Management fee* pada master barang/jasa. PDF dokumen memisahkan baris tersebut ke seksi Management Fee dengan subtotal masing-masing.

**NPWP**: master pelanggan/pemasok hanya menerima NPWP 15/16 digit atau NITKU 22 digit (titik/strip diabaikan). Nilai seperti "not applicable" harus dikosongkan.

## Master data v5: kontrak, aset dan kode lokasi Odoo

- **Karyawan:** isi *Status hubungan kerja*, *Mulai kontrak* dan *Akhir kontrak*. PKWT wajib memiliki tanggal akhir dan jangka waktunya tidak boleh lebih dari 5 tahun (PP 35/2021). Dashboard Employees menampilkan kontrak dan sertifikat yang habis dalam 30 hari.
- **Aset:** *Ruang lingkup* (Head Office/Proyek) sudah diisi dari jejak workbook sumber. *Kelompok harta fiskal* ditetapkan Finance.
- **Gudang:** *Kode lokasi Odoo* membantu rekonsiliasi migrasi. Gudang KBAHO dibuat dengan status menunggu verifikasi. Duplikat dan lokasi GOR yang belum dipetakan tercantum di LAPORAN_DATA_V5.md.
- **Partner:** tandai *PKP* hanya bila NPWP/NITKU tersedia.

## Buku besar 2026 dan laporan manajemen (v6)

- Jurnal Januari–Oktober 2026 KBA telah dibukukan dari *Kertas Kerja Akuntansi KBA 2026* ke periode **Januari s.d. Oktober 2026 (kertas kerja)**. Periode ini dibiarkan terbuka. Koreksi atas temuan dicatat sebagai jurnal penyesuaian di periode tersebut. Saat Finance menutup periode, saldo dibawa ke November.
- Dokumen operasional bertanggal dalam rentang itu tidak dapat diposting lagi agar buku besar tidak terhitung ganda.
- **Accounting → Laporan manajemen** menyajikan laba rugi bertingkat, tren bulanan, posisi, arus kas, biaya terbesar, narasi otomatis dan temuan kertas kerja. Laporan dapat diunduh dalam PDF dan Excel.
- Dashboard laba rugi per cabang menampilkan bulan terakhir yang sudah dibukukan bila bulan berjalan belum memiliki jurnal.
- Rincian rekonsiliasi dan batasan ada di LAPORAN_KEUANGAN_V6.md.

## Penelusuran laporan, rasio dan pasangan tombol workflow (v7)

**Penelusuran (drill-down / drill-up).** Di *Accounting → Laporan keuangan*, klik pos Neraca, Laba rugi, Perubahan modal atau Arus kas. Jendela *Telusur laporan → bukti sumber* membuka:

1. akun buku besar pembentuk pos beserta nilainya;
2. jurnal pembentuk akun (25 per halaman, terbaru lebih dulu);
3. detail jurnal: baris jurnal, baris kertas kerja (file, sheet, baris), register invoice sumber dengan nomor yang sama, dokumen operasional (invoice/PO/WO/kasbon) yang diposting ke jurnal itu, lampiran, dan tautan bukti https di uraian.

Jejak navigasi di bagian atas dipakai untuk naik kembali. Dari detail jurnal, tombol *pos laporan terkait* membawa ke pos Neraca/Laba rugi/Arus kas yang dipengaruhi jurnal itu (drill-up). Nomor jurnal di *Jurnal umum* dan *Buku besar* juga dapat diklik. Relasi hanya ditampilkan bila ada tautan eksplisit; kecocokan nomor yang tidak unik diberi label *perlu verifikasi* dan tidak pernah ditebak dari nama atau nominal.

**Rasio keuangan dan operasional.** Panel *Rasio keuangan & operasional* menampilkan rumus, pembilang, penyebut, dasar periode dan tautan telusur untuk setiap rasio (margin, beban usaha, liabilitas terhadap aset/ekuitas, kas, arus kas operasi, ROA/ROE, perputaran aset, rasio lancar/cepat/kas, DER berbunga, DIO, DSO, interest coverage, penyelesaian dokumen, pertanggungjawaban kasbon, kelulusan QC). Rasio tidak disetahunkan. Bila klasifikasi akun belum ditetapkan atau penyebut nol/negatif, rasio tampil *Belum tersedia* beserta alasannya — bukan nol. Klasifikasi aset/liabilitas lancar, aset cepat, pinjaman berbunga, persediaan, piutang usaha, penjualan kredit dan beban bunga ditetapkan Finance di *Pengaturan → Pemetaan rasio*. Rasio ikut diekspor bersama laporan keuangan dan laporan manajemen.

**Pasangan tombol workflow.**

| Tindakan | Pasangannya | Siapa | Catatan |
|---|---|---|---|
| Ajukan persetujuan | Tarik pengajuan | Pembuat atau pengelola | Alasan minimal 10 karakter; stempel OPS/persetujuan dihapus, dokumen kembali draft |
| Setujui | Tolak (sebelum disetujui) dan Tolak persetujuan (setelah disetujui, sebelum posting) | Pengelola | Alasan wajib |
| Post jurnal draft | Tolak draft / Batalkan draft | Finance/Admin; penolak ≠ pembuat; pembatalan oleh pembuat atau Admin | Draft tidak dihapus: status *Ditolak*/*Dibatalkan* dan jejak audit tersimpan |
| Jurnal diposting | Jurnal pembalik | Finance/Admin | Jurnal posted tetap tidak dapat diedit atau dihapus |
| Sign-off Finance / Persetujuan Direksi | Tarik sign-off; Tolak / kembalikan laporan | Penandatangan atau Admin; penolakan oleh Direksi yang berbeda dari Finance | Sign-off otomatis kedaluwarsa bila buku besar berubah setelah ditandatangani |
| Catat pengecualian Direksi | Cabut pengecualian | Direksi/Admin | Alasan minimal 10 karakter |
| Setujui baris impor | Tolak baris impor | Pengelola | Alasan wajib |

Sign-off dan UAT bisnis tetap harus dilakukan pengguna Finance dan Direksi yang berwenang.
