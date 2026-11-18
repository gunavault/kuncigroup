# Pemeriksaan data dan kualitas ERP Kunci Group — 18 November 2026

Alamat aplikasi: https://kunci-erp-45422633542.us-central1.run.app

Status penerapan cloud: menunggu verifikasi akhir. Hasil di bawah telah diverifikasi pada database dan aplikasi lokal. Bagian penerapan akan diperbarui setelah pengujian cloud selesai.

## 1. Cakupan dan metode

Keenam workbook dibaca seluruh struktur tabelnya. File asli tidak diedit; SHA-256 sebelum dan sesudah pemeriksaan cocok. Instruksi dan rekomendasi di dalam workbook diperlakukan sebagai isi sumber, bukan sebagai perintah untuk mengubah hak akses atau memposting transaksi.

Referensi sumber disimpan sebagai nama file, sheet, baris/kolom, hash dan batch impor. Parser tabel membaca XML workbook secara langsung karena beberapa hubungan drawing/VML pada sumber rusak. Formula tidak dieksekusi. Nilai cache, formula tanpa hasil, dan error dibedakan. Jurnal dihitung ulang per voucher menggunakan satuan sen; stok dihitung ulang dalam seperseribu unit.

| Workbook | Perlakuan di ERP |
|---|---|
| MASTER ABSENSI ALL PROJECT OKTOBER 2026.xlsx | Scan mentah, absensi harian utama, dan pemeriksaan ringkasan dipisahkan agar tidak dihitung ganda |
| Master Data Asset - Project.xlsx | Register aset proyek, nomor seri, lokasi, kondisi dan referensi serah terima; kode kosong diberi kode lokal yang jelas dan status pemeriksaan |
| Data Stock - Project.xlsx | Saldo dan mutasi sumber per barang/lokasi; dipisahkan dari stok tersedia yang telah diposting |
| Master Data Aset Head Office - KBA.xlsx | Register detail aset HO; lembar opname kosong tidak dianggap sebagai bukti pemeriksaan fisik |
| Database Resource KBA 17 Nov 2026.xlsx | Roster karyawan aktual, ID kerja, departemen, jabatan, lokasi, tanggal masuk/resign, dan referensi penempatan |
| Kertas_Kerja_Akuntansi_KBA_2026 (2).xlsx | COA, pelanggan/vendor, proyek, katalog dan kelas aset; jurnal/dokumen/laporan sumber disimpan untuk pemeriksaan tanpa posting otomatis |

## 2. Hasil data

Angka master berikut adalah jumlah baris master yang dinormalisasi dari enam sumber. Master dengan identitas kuat yang sama dihubungkan ke identitas ERP yang sudah ada. Angka ini tidak boleh dijumlahkan dengan semua referensi historis lama untuk menghitung personel, unit aset, atau stok tersedia.

| Data | Jumlah | Arti |
|---|---:|---|
| Roster 17 November | 221 karyawan | 220 aktif pada tanggal pemeriksaan; 1 resign efektif 7 November |
| Identitas historis tambahan | 54 | Nama absensi yang belum cocok persis dengan roster; nonaktif dan memerlukan pemadanan HR |
| Departemen / jabatan | 3 / 17 | Terhubung dengan master karyawan |
| Register aset | 211 baris | 29 proyek + 182 HO; sebagian berupa kelompok beberapa unit |
| Gudang sumber | 5 | GOR, KLH Bonas, KLH Plaza Kuningan, Pandawa dan SKD 17 |
| Barang/jasa katalog | 471 baris | Termasuk katalog/RAB; bukan jumlah barang fisik tersedia |
| Pelanggan / vendor | 13 / 29 | Penerima anonim/agregat tidak dibuat menjadi identitas orang atau badan usaha palsu |
| Proyek/lokasi referensi | 15 | Lokasi operasional dan master proyek sumber dipertahankan sesuai cakupannya |
| Kelas aset | 7 | Berbeda dari unit aset fisik |

| Catatan sumber tersimpan | Jumlah |
|---|---:|
| Absensi harian | 5.938 |
| Scan absensi mentah | 4.117 |
| Pemeriksaan ringkasan absensi | 224 |
| Saldo stok barang/lokasi | 190 |
| Baris jurnal sumber | 4.245 |
| Dokumen keuangan sumber | 1.688 |
| Referensi/laporan/master sumber | 4.290 |
| Kontrol dan temuan sumber | 67 |
| **Total** | **20.759** |

Sebanyak 2.000 voucher jurnal sumber seimbang dari hitung ulang. Total debit dan kredit masing-masing **Rp53.321.478.633,96**. Tanggal dan nomor dokumen dinormalisasi dari bukti sumber untuk 1.045 baris invoice/permintaan yang bertanggal; tanggal kosong tetap kosong. Angka ini merupakan jumlah perputaran jurnal sumber, bukan saldo kas, omzet, laba atau opini audit. Sebanyak 4.177 baris terhubung ke akun ERP. Kode penampung 99901, 99902 dan 99903 masih memerlukan keputusan klasifikasi Finance.

Impor ulang pada versi normalisasi yang sama menghasilkan **0 master baru** dan jumlah catatan sumber tetap. Riwayat dan referensi lama dipertahankan; tampilan Employees memakai filter roster terbaru agar headcount tidak menggandakan referensi historis.

## 3. Temuan yang memerlukan keputusan bisnis

Antrean batch memuat **99 catatan pemeriksaan**. Status aplikasi yang berfungsi tidak mengubah bukti sumber yang belum lengkap menjadi data terkonfirmasi.

### Absensi dan personel

- Halim/GOR mencakup 24 September–20 Oktober 2026. KLH mencakup 26 September–20 Oktober. Judul KLH menyebut Juli dan Oktober secara bertentangan.
- Empat error `#N/A` terdapat di kolom DV rekap GOR yang berkaitan dengan pencarian rekening. Error tersebut tidak dijadikan data rekening/identitas karyawan dan tidak dianggap sebagai error semua jam absensi.
- Ada 450 hari dengan bukti harian kosong. Statusnya **belum diketahui**, bukan otomatis hadir atau absen.
- Sebanyak 27 ringkasan menyatakan jumlah hadir melebihi jumlah hari dalam rentang rekap. Nilai ringkasan sumber dan hasil hitung harian sama-sama dapat diperiksa.
- Sebanyak 1.471 baris harian terkait 54 identitas historis yang belum cocok persis dengan roster November. HR dapat memadankan identitas melalui rincian sumber, dengan catatan dan jejak pemeriksa. Pemadanan samar tidak dilakukan otomatis. Tiga pasangan nama sama memiliki ID kerja berbeda; masing-masing dipertahankan sebagai identitas menurut ID kerja dan tidak digabung berdasarkan nama.
- Koreksi finger/timestamp lebih dari lima menit dan kemungkinan sif lintas hari ditandai. GPS historis tidak direka.
- Roster memuat satu rencana resign 30 November; orang tersebut masih aktif pada 18 November. HR harus mengelola penghentian akses pada tanggal efektif dan perusahaan yang sesuai.
- Lima belas baris memakai kode penempatan KCG/KCH. Kode tersebut bukan bukti perusahaan pemberi kerja. Data sumber KBA tetap diberi penanda klarifikasi afiliasi.
- Lokasi GOR pada roster adalah **GOR Chandrabaga**. Referensi GOR Sumut tetap dipisahkan. Karyawan SKD 17 serta KLH Bonas/Kuningan dipetakan berdasarkan lokasi sumber; riwayat yang hanya menyebut proyek induk tidak diberi lokasi lebih rinci secara spekulatif.

### Aset dan stok

- Register detail HO berisi 182 baris, sedangkan pivot kategori menyebut 177. Pivot tidak dipakai sebagai jumlah detail terbaru.
- Ada 28 baris aset proyek tanpa kode sumber. Kode `LOCAL-PROJ-…` merupakan kode ERP lokal; identitas tetap perlu diperiksa melalui nomor seri dan bukti aset.
- Baris register dengan kuantitas lebih dari satu tidak otomatis dipecah menjadi unit/nomor seri fiktif. Nilai perolehan kosong tetap belum tersedia.
- Lembar service/opname yang hanya berisi nomor urut dan formula template tidak menghasilkan transaksi pemeriksaan atau perawatan palsu.
- Dari 190 saldo stok, 116 cocok secara aritmetika dan 74 perlu pemeriksaan lebih lanjut, termasuk saldo awal kosong, tanda mutasi, tanggal atau selisih hitung. Cocok secara aritmetika belum membuktikan hasil opname fisik.
- Harga RAB/katalog tidak dipakai sebagai biaya unit aktual. Rental mesin dicatat sebagai jasa sesuai kategori sumber.

### Keuangan

- Kertas kerja memuat estimasi biaya tenaga kerja, akun penampung, penerima yang disamarkan, dan saldo bank yang belum direkonsiliasi. Jurnal sumber belum diposting ke buku besar resmi.
- TEMUAN sumber memuat estimasi biaya tenaga kerja sekitar Rp9,54 miliar, kas analitis negatif setelah estimasi, dan selisih penerimaan tahun sebelumnya. Ini merupakan temuan/analisis dalam sumber yang perlu bukti dan keputusan Finance.
- MD_KARYAWAN yang disamarkan, parameter payroll, median upah tahun sebelumnya, kelas aset dan anggaran tidak diubah menjadi karyawan bernama, gaji individual, aset fisik, atau transaksi nyata.
- Saldo buku bank tidak dianggap sebagai konfirmasi rekening koran. PPN/PPh dan cut-off tetap memerlukan verifikasi Finance berdasarkan dokumen transaksi.

## 4. Aliran data dan penggunaan layar

1. **Employees** menampilkan roster 221 karyawan. Gunakan pencarian ID kerja/nama/jabatan/departemen. Klik nama untuk rincian dan asal data. Pilihan **Semua termasuk referensi historis** membuka referensi lama sesuai hak akses.
2. **Master data** memuat pelanggan/vendor, produk/jasa, gudang, proyek, departemen, jabatan, kelas aset dan aset. Referensi terhubung melalui identitas ERP dan pemeriksaan perusahaan/cabang.
3. **Attendances**, **Employees**, **Inventory** dan **Dashboards** memiliki panel data unggahan. Menu **Data unggahan** membuka seluruh jenis yang diizinkan. Filter perusahaan, cabang, jenis, status, tanggal, pencarian dan pagination berlaku di server.
4. **Rincian sumber** menampilkan nama file, sheet, baris/kolom, nilai asli, hasil hitung dan peringatan. Pemeriksa dapat mencatat tinjauan atau menolak data. Peninjauan tidak memposting jurnal.
5. Untuk membuka stok tersedia, Finance/Admin meninjau saldo sumber terlebih dahulu. Setelah status ditinjau, isi tanggal pembukaan, biaya unit terverifikasi, bukti, lot/kedaluwarsa. Sistem membuat **draft Inventory**, lalu mengikuti alur pengajuan → persetujuan → posting. Satu saldo sumber hanya dapat menghasilkan satu dokumen aktif. Produk, cabang dan jumlah diperiksa kembali saat posting.
6. Transaksi baru menggunakan master yang sama dalam Sales/Purchase, Inventory/Barcode, kasbon/Expenses, proyek/Timesheets/Attendances, serta Quality/Maintenance. Efek pembukuan tetap melalui jurnal seimbang dan transaksi database atomik.
7. Angka dashboard pembukuan berasal dari ledger posted. Data sumber yang belum diposting tampil dengan dasar data yang jelas; tidak ditambahkan diam-diam ke angka resmi.

## 5. Hierarki dan manajemen pengguna

Hierarki inti: **Administrator → Direktur → Manager → Staf → Karyawan**. Finance, HR, Supervisor dan Auditor merupakan peran fungsional tambahan. Atasan langsung dan cakupan cabang ditetapkan per perusahaan.

| Peran | Cakupan operasional | Persetujuan / posting | Pengelolaan pengguna |
|---|---|---|---|
| Administrator pusat | Seluruh perusahaan | Administrasi dan finalisasi; akun teknis harus digunakan secara terkendali | Global; akun pemilik dan akun sendiri terlindungi dari penonaktifan melalui formulir ini |
| Administrator perusahaan | Perusahaan/cabang yang diberikan | Persetujuan dan posting sesuai perusahaan | Peran di bawahnya; perubahan identitas/password lintas perusahaan memerlukan administrator pusat |
| Direktur | Pengawasan perusahaan/cabang dan master operasional | Persetujuan; posting keuangan tetap Finance/Admin | Manager, Finance, HR, Supervisor, Staf, Karyawan, Auditor di bawah tingkatnya |
| Manager | Operasi dalam cabang dan hierarki yang diberikan | Persetujuan; finalisasi operasional yang diizinkan | Supervisor/Staf/Karyawan dalam hierarkinya; tidak boleh memperluas cabang |
| Finance | Operasi dan data keuangan sesuai akses | Posting keuangan, saldo awal stok, jurnal dan rekonsiliasi | Tidak mengelola hierarki pengguna |
| HR | Data personel, absensi, sif, timesheet dan referensi HR | Persetujuan/finalisasi HR | Staf/Karyawan di bawah tingkatnya sesuai cabang |
| Supervisor | Pengawasan operasional sesuai cabang | Finalisasi operasional yang diizinkan; bukan persetujuan keuangan | Tidak mengelola pengguna |
| Staf | Dokumen sendiri, kasbon/klaim, absensi/timesheet serta tugas lapangan yang diizinkan | Pengajuan sendiri; tidak menyetujui/posting keuangan | Tidak mengelola pengguna |
| Karyawan | Layanan mandiri kasbon, Expenses, absensi dan timesheet; data diri yang terhubung | Pengajuan sendiri | Tidak mengelola pengguna |
| Auditor | Baca sesuai cakupan | Tanpa perubahan transaksi | Tidak mengelola pengguna |

Settings menyediakan pencarian pengguna, pembuatan akun, edit profil, penggantian peran/cabang/atasan, hubungan akun–karyawan, reset kata sandi, penonaktifan akses perusahaan dan kontrol akun global khusus administrator pusat.

Kontrol yang diterapkan:

- Login dapat memakai email atau username; tidak dibuat email palsu untuk karyawan tanpa email.
- Kata sandi awal minimal 16 karakter, disimpan dengan scrypt, dan wajib diganti sebelum mengakses operasi bisnis.
- Sesi memakai token acak/opaque, masa berlaku 8 jam, cookie Secure/HttpOnly/SameSite Strict pada produksi, dan pencabutan sesi setelah reset/perubahan hak akses/logout.
- Atasan harus aktif, lebih tinggi tingkatnya, dan sesuai perusahaan/cabang. Siklus dan pelaporan kepada diri sendiri ditolak.
- Peran setara/lebih tinggi, akun pemilik, pengguna di luar perusahaan atau di luar hierarki manager tidak dapat dikelola sembarangan.
- Atasan dengan bawahan aktif harus memindahkan bawahan sebelum dinonaktifkan atau dipersempit cakupannya.
- Satu identitas karyawan hanya dapat terhubung sekali per perusahaan. Resign yang efektif pada sumber pemeriksaan menonaktifkan akses perusahaan yang terkait.
- Penonaktifan akses tidak menghapus riwayat transaksi. Profil/password pengguna lintas perusahaan dikelola pusat agar tidak dapat diambil alih administrator perusahaan lain.
- Jabatan Excel tidak otomatis membuat akun atau memberikan akses Direktur/Administrator. Administrator memilih orang, peran dan atasan secara eksplisit.

## 6. Hasil uji kualitas

- **62 pengujian otomatis lulus** pada PostgreSQL: pembukuan, jurnal immutable, tutup buku, kasbon/Expenses/pembayaran, PPN/PPh manual, FEFO/expired/QC, transfer, produksi dan konservasi nilai, GPS/timesheet/sif, RBAC, hierarki, sumber, serta keamanan origin.
- **7 kelompok uji UI lulus** pada browser terisolasi: pemuatan data, filter/pencarian/rincian stok, rentang tanggal/pagination, roster/pencarian ID, pembuatan–edit–reset–nonaktif pengguna, halaman/formulir modul, dan navigasi/tabel pada lebar ponsel.
- Tampilan diperiksa pada 1440×1000 dan 390×844. Tidak ada error JavaScript aplikasi selama skenario UI. Browser pengujian memakai profil terisolasi tanpa membaca tab pribadi pengguna.
- TypeScript dan build produksi lulus. Pemeriksaan data mencocokkan hash keenam sumber, jumlah baris, identitas, rentang tanggal, jurnal per voucher, saldo stok dan status sumber.
- Ditemukan dan diperbaiki bug tanggal mutasi keluar yang memakai tanggal proses. Mutasi kini mengikuti tanggal dokumen; pengujian regresinya lulus.
- Pengujian ini tidak merupakan pembuktian bahwa seluruh kemungkinan input/perangkat bebas cacat. Kamera ponsel, GPS lapangan, mesin finger dan perangkat fisik harus diuji pada perangkat/lokasi operasional.

Bukti mesin: `artifacts/data-qa-v3.json`, `artifacts/ui-qa-v3.json`, `artifacts/import-v3-result.json`, dan setelah penerapan `artifacts/production-smoke-v3.json`.

## 7. Penerapan dan batas operasional

Backend tetap pada VM Google Cloud **kunci-erp-pilot**, project **kunci-group-erp-20261116**, zona **us-central1-a**. Gateway Cloud Run yang sudah tersedia tetap digunakan untuk HTTPS sementara. Tidak diperlukan VM, Cloud SQL atau gateway baru. Website root `kuncigroup.cloud` tidak diubah.

Prosedur penerapan mencadangkan database/lampiran sebelum perubahan, menyimpan aplikasi sebelumnya, menjalankan migrasi dan impor dua kali untuk memeriksa idempotensi, menjalankan pengujian, membangun aplikasi, menguji API, lalu membuat backup dan menguji restore ke database sementara. File impor privat tidak menjadi unduhan publik.

Batas yang tetap berlaku: sumber Drive lama yang hanya diindeks belum seluruhnya diekstrak; sinkronisasi Drive berkala, payroll penuh, bank/e-faktur, mesin finger, integrasi delivery/POS pihak ketiga dan IoT memerlukan integrasi tersendiri. Sistem menggunakan satu VM ekonomis; belum merupakan arsitektur high availability. Akun individual, geofence aktual, bukti biaya, saldo awal dan keputusan atas temuan sumber harus disahkan pengelola terkait.
