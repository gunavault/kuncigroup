# Rencana v7 — penelusuran, rasio dan kelengkapan workflow

Baseline 24 November 2026: lokal utama dan branch `feat/master-data-v5` berada pada `0994523` (v6.2). Perubahan v4–v6.2 dipertahankan. Area kerja terisolasi: `repo-kuncigroup`, branch `codex/erp-v7-traceability-ratios-workflow`. Jurnal historis dan koreksi yang sudah diposting tidak diimpor ulang atau diedit.

1. Bandingkan source lokal/Git/cloud dan bukti penerimaan. Inventaris sumber Drive, unggahan dan rujukan resmi; nyatakan cakupan dan yang belum diperiksa.
2. Sediakan penelusuran laporan → kelompok/akun → buku besar → jurnal → dokumen operasional/relasi PO/WO → bukti/lokasi sumber. Navigasi kembali mempertahankan konteks. Relasi tidak terbukti ditandai, bukan ditebak.
3. Lengkapi penolakan dan pembatalan draft jurnal, penolakan setelah persetujuan dokumen, pencabutan/penolakan sign-off dan pengecualian. Semua aksi beralasan, berotorisasi dan tercatat; jurnal POSTED tetap hanya dapat dikoreksi melalui pembalik/penyesuaian.
4. Tambahkan rasio finansial/operasional dengan rumus, komponen yang dapat ditelusuri, periode, satuan dan alasan ketidaktersediaan. Pembagi nol/data kosong bukan nol rasio. Jangan mengarang benchmark industri, klasifikasi akun, payroll atau transaksi.
5. Uji unit/integrasi, SIT dan simulasi UAT per peran, ekspor, UI desktop/ponsel serta batas akses. UAT dan sign-off bisnis oleh Finance/Direksi tetap memerlukan pengguna berwenang.
6. Perbarui dokumentasi Indonesia, scan rahasia/data, push branch dan PR/review gunavault. Deploy pada VM existing dengan backup, migrasi aman, uji PAT publik dan restore terpisah. Jangan menimpa pekerjaan agen lain.

Temuan awal: source v6.2 sudah menautkan jurnal kertas kerja melalui `SourceFact.data.ledger`, tetapi laporan belum menyediakan alur drill-down lengkap. Jurnal draft hanya memiliki Post; dokumen APPROVED belum menampilkan Tolak meskipun backend mengizinkan. Gerbang finalisasi belum mempunyai pencabutan/penolakan sign-off. Rasio manajemen baru margin bruto/neto.

## Status 24 November 2026 (lokal)

| Butir | Status | Bukti |
|---|---|---|
| 2. Penelusuran laporan ↔ akun ↔ jurnal ↔ dokumen/sumber | Selesai | `src/lib/financial-trace.ts`, `/api/financial-trace`, uji `tests/financial-trace.test.ts`, QA UI v7 |
| 3. Pasangan tombol workflow (tolak/batal draft jurnal, tarik pengajuan, tolak setelah setuju, tarik/tolak sign-off, cabut pengecualian) | Selesai | migrasi `202611240001_journal_terminal_status`, uji integrasi |
| 4. Rasio keuangan & operasional dengan rumus, komponen dan alasan ketidaktersediaan | Selesai; rasio berbasis klasifikasi menunggu pemetaan akun oleh Finance | `src/lib/financial-ratios.ts`, Pengaturan → klasifikasi akun untuk rasio |
| 5. Uji | typecheck lulus; 93/93 test lulus; build produksi lulus; QA UI v7 lokal 5/5 lulus | — |
| 6. Dokumentasi | PANDUAN_OPERASIONAL.md bagian v7 | — |
| Deploy produksi | Selesai 24 Nov 2026 (rilis `v7-69de215`) atas persetujuan pemilik: backup pra/pasca rilis OK, migrasi diterapkan, 93/93 test di VM lulus, build lulus; PAT publik read-only `qa-ui-v7` 5/5 dan regresi `qa-ui-v6` 7/7 lulus | `/tmp/kunci-upgrade.log` di VM |

Tetap di luar kewenangan sistem/agen: sign-off Finance dan Direksi, penyetoran PPh 21/BPJS, serta penetapan klasifikasi akun rasio.

## v8 — rekonsiliasi bank, pemetaan rasio otomatis, register bukti (25 November 2026)

| Butir | Status |
|---|---|
| Rekonsiliasi rekening koran (Accounting → Rekonsiliasi bank) dan syarat finalisasi bank | Selesai |
| Impor koran Mandiri KBA Jan–Sep 2026 (1.229 baris) dan BCA Januari (2 baris) dari workbook Finance di Drive | Diterapkan di produksi; data sumber saja, tanpa posting jurnal |
| Pemetaan akun rasio otomatis KBA (`apply-ratio-mapping.ts`) | Diterapkan di produksi; perlu ditinjau Finance |
| Register bukti (sheet BUKTI) pada penelusuran jurnal | Selesai |
| Uji | typecheck; 98/98 test lokal dan di VM; build; QA v8 4/4, v7 5/5, v6 7/7 di URL publik |
| Deploy produksi | Rilis `v8-257ac6f` atas persetujuan pemilik; backup pra/pasca rilis OK |
| Belum dapat dilakukan | Koran BCA Feb–Okt, BJB, Mandiri Oktober, rekening giro & payroll belum tersedia sebagai workbook; sign-off Finance/Direksi oleh pengguna berwenang |
