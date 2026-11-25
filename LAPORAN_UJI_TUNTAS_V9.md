# Dashboard, sumber data dan siklus akuntansi jasa v9

Tanggal kajian: 25 November 2026. Dokumen ini menjelaskan implementasi dan bukti teknis. Temuan privat, nominal perusahaan, sumber workbook dan rekap Excel/PPT berada di direktori yang diabaikan Git.

## Perubahan yang dipertahankan dan dilengkapi

Sebelum mengubah kode, branch lokal/Git dan source cloud dibandingkan. Baseline `eb1cf35` memuat v7 (traceability, rasio, pasangan workflow) dan v8 (rekening koran, usulan klasifikasi, register bukti) dari pekerjaan agent sebelumnya. Perubahan tersebut dipertahankan. Main di-fetch dan digabung dengan fast-forward bila memungkinkan; source tidak direset.

| Kebutuhan | Implementasi dan batas bukti |
|---|---|
| Dashboard nol yang membingungkan | Angka buku besar dipisahkan dari register dokumen impor dan rencana. Kartu menyebutkan periode, cakupan, akun kontrol dan tautan. Data yang belum ada tidak diubah menjadi saldo rekaan. |
| Ringkasan 19 modul | Tetap 4–6 kartu dengan agregat seluruh cakupan. Filter periode diterapkan pada dokumen dan absensi sumber; master/lot adalah register terkini. Kartu nominal mendapat ruang lebih agar rupiah terbaca. |
| Aging dan subledger | AR/AP dari jurnal dokumen dan pembayaran sampai tanggal laporan. Tersedia rekonsiliasi ke GL, saldo belum dipadankan, filter dan drill-down. Rincian yang belum tertaut tetap menjadi pekerjaan Finance. |
| Neraca saldo sebelum/sesudah penyesuaian | Kertas kerja menampilkan kolom sebelum penyesuaian (D–K), penyesuaian (D–K), debit dan kredit setelah penyesuaian. Kolom sebelum penyesuaian mencakup transaksi reguler, bukan hanya saldo awal. |
| Profitabilitas site | Pendapatan dan beban langsung jasa/beban lain direkonsiliasi ke laba perusahaan. Alokasi analitis berbukti membagi baris jurnal ke proyek tanpa mengubah jurnal asli. |
| Tenaga kerja dan chemical | Pemetaan eksplisit, rasio tenaga kerja/pendapatan, mutasi stok dan anggaran/aktual berbukti. Data payroll neto/RAB tidak disamakan dengan biaya bruto atau stok aktual. |
| Kas talangan | Rencana penerimaan/pengeluaran setelah kas dasar, saldo skenario dan kebutuhan dana. Rencana dan transaksi aktual terpisah. |
| Kerangka pelaporan dan CaLK | Keputusan berbukti serta delapan bagian pengungkapan. Catatan tersimpan sebagai draft, bukan sertifikasi SAK otomatis. |
| Penyesuaian jasa | Delapan panduan dengan bukti wajib dan status DRAFT. Pengguna tetap menetapkan substansi akun/nominal. |
| Rasio otomatis | Usulan perlu tinjauan Finance dengan hash/stempel server. Nilai berbasis usulan ditandai SEMENTARA dan memuat dasar perhitungan. Pemetaan/data yang belum ada tetap tidak dihitung. Form perusahaan umum mempertahankan klasifikasi yang terakhir ditinjau. |
| Rekonsiliasi bank | Saldo awal kosong tetap tidak diketahui. Cakupan bulan, putus kontinuitas, selisih saldo cetak dan akun aktif bersaldo nol diperiksa. Kandidat pencocokan memerlukan verifikasi Finance. |
| Finalisasi | Seluruh perusahaan nyata memerlukan dasar pembukuan dan pengungkapan. Perubahan buku besar, klasifikasi, koran atau catatan/rencana membuat sign-off lama kedaluwarsa. Tidak ada sign-off bisnis yang dibuat oleh agent. |

Tambahan cloud yang terdeteksi pada pemeriksaan ulang dipertahankan: analisis site dari kolom sumber pada jurnal kertas kerja, register INV/OPS_UTANG, parameter UJI_PAYROLL, PROYEKSI_KAS, RAB tender serta neraca saldo penutup. Analisis sumber ini ditampilkan terpisah dari subledger/alokasi proyek ERP. Seluruh sisa piutang, termasuk selisih kecil, tetap masuk saldo terbuka. Penerimaan ambigu tetap belum tersedia. RAB × bulan invoice adalah perbandingan indikatif yang perlu konfirmasi masa layanan/kontrak, bukan anggaran yang otomatis disahkan. Klasifikasi otomatis tetap SEMENTARA.

## Sumber dan tindak lanjut

Enam workbook unggahan telah dicocokkan kembali terhadap hash dan jejak impor; nilai cache, rumus dan kesalahan sumber dipertahankan. Kajian siklus jasa terbaru diperlakukan sebagai referensi kebutuhan, bukan perintah untuk memposting atau pengganti bukti transaksi. Indeks Drive historis mencakup metadata; isi seluruh berkas belum diekstrak. Keterbatasan indeks lama pada tiga folder tetap tercatat.

Pemeriksaan Drive lanjutan memeriksa ulang folder utama, Finance, Operasional, Logistik dan anggaran proyek. Revisi rekap invoice dipisahkan per penerbit; konflik tidak dipaksakan menjadi transaksi. Perbandingan dua sumber anggaran menemukan isi SHA256 identik dengan nama proyek berbeda serta ketidaksesuaian nama/isi. Temuan ditahan dalam register CONTROL untuk klarifikasi, tanpa pembentukan saldo, alokasi, anggaran aktual atau jurnal. Rincian lokasi berada pada rekap privat dan UI Data unggahan.

Finance masih perlu melengkapi rincian invoice/kasbon terhadap GL, bukti bank dan cut-off, saldo lot/biaya fisik, alokasi site, klasifikasi biaya, RAB/RAP yang sesuai, rencana payroll bruto serta keputusan/pengungkapan. Seluruh angka historis tidak otomatis menjadi data per cabang atau lot.

## Pengujian dan status rilis

- 104 pengujian otomatis lulus pada schema sementara, termasuk akuntansi, stok, RBAC, workflow, isolasi periode, aging historis, alokasi, rencana, review bank/rasio, analisis sumber dan ekspor. Typecheck setelah penggabungan lulus. Build/QA akhir dicatat pada checklist rilis.
- QA browser lokal lulus tujuh kelompok: angka/tautan dashboard, enam tab jasa dan form tambah/hapus, ekspor, 19 modul, lebar 390px, CSRF/cakupan/finalisasi, serta simpan dan pemulihan draft DEMO. Tidak ada galat JavaScript pada skenario tersebut.
- Simulasi UAT teknis menggunakan fixture/schema uji dan DEMO lokal. UAT Finance/Direksi, kamera/GPS fisik, uji beban dan penerimaan bisnis belum dinyatakan selesai.
- Status push/PR, deployment, PAT publik, cadangan/restore dan laporan privat dicatat setelah bukti tahap tersebut tersedia pada [WORK_PLAN_V9.md](WORK_PLAN_V9.md).

## Rujukan evaluasi

Kerangka dan pengungkapan perlu dipilih menurut kondisi entitas. [IAI SAK EP](https://web.iaiglobal.or.id/SAK-IAI/Tentang%20SAK%20Entitas%20Privat%20%28EP%29) dan [daftar bab efektif 2025](https://web.iaiglobal.or.id/SAK-EP-Efektif/SAK%20Entitas%20Privat%20Efektif%20Per%201%20Januari%202025) menjadi referensi kajian, bersama [PSAK 201](https://web.iaiglobal.or.id/PSAK-Umum/7). Arus kas ditelusuri menurut [IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/). Penentuan pajak tetap memerlukan objek dan bukti sesuai [DJP PPh 23](https://www.pajak.go.id/id/pemotongan-pajak-penghasilan-pasal-23).

Evaluasi rasio memperhatikan basis dan keterbatasan sebagaimana [ACCA ratio analysis](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f2/technical-articles/ratio-analysis.html). Paritas alur mengacu antara lain [laporan Odoo 19](https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting.html). Referensi ini membantu desain kontrol dan kajian; bukan opini audit, nasihat hukum individual atau bukti kepatuhan menyeluruh.

## Handoff agent berikutnya

Mulai dari AGENTS, README, panduan dan checklist rilis ini. Fetch/pull main sebelum setiap batch, pertahankan branch feature dan minta reviewer/assignee gunavault tanpa merge sendiri. Source cloud berada pada VM existing di balik proxy Cloud Run. Data produksi tidak boleh direset untuk meluluskan QA.

`ledger-overview.ts`, `service-report.ts`, `service-plans.ts`, `service-export.ts` dan `ratio-mapping-review.ts` adalah titik masuk baru. Endpoint `/api/service-report` menggunakan autentikasi/cakupan dan pemeriksaan origin untuk POST. Rencana disimpan per periode dengan versi optimistis, penguncian dan audit. Jalankan `npm.cmd test`, typecheck dan build berurutan ketika Prisma DLL Windows sedang digunakan. `scripts/qa-ui-v9.mjs` bersifat read-only untuk KBA/cloud; `UI_WRITE_DEMO=1` hanya bekerja pada localhost dan memulihkan isi draft DEMO. Uji restore terkini memakai `deploy/verify-restore-current.sh` pada database sementara, bukan script lama dengan jumlah source yang sudah berubah.
