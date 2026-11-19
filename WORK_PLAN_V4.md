# Rencana ERP v4 — 19 November 2026

## Tujuan

Periksa nominal dan hubungan transaksi/master terhadap enam workbook serta makalah/panduan. Tambahkan 4–6 kartu setiap modul. Serahkan rekap kekosongan dalam Excel dan PowerPoint. Uji UI/fungsi. Perubahan melalui branch dan PR gunavault/kuncigroup dengan reviewer gunavault.

## Pelaksanaan

1. Selesai: main 132f070 diperiksa, AGENTS/dokumentasi Next dibaca, Context7 digunakan. Branch `codex/erp-v4-module-kpis-data-audit`.
2. Selesai: audit produksi, hash sumber, pembacaan XML independen dan pemeriksaan 11 berkas. Snapshot mentah tetap di server. Hanya temuan/agregat diambil untuk laporan.
3. Selesai: 4–6 kartu pada 19 modul, cakupan perusahaan/cabang/pengguna, hitungan penuh dan uang dalam sen. Katalog bersama mengikuti filter cabang.
4. Selesai: Excel tujuh sheet dan presentasi 12 slide, lokasi sumber, nominal pembanding, pemilik tindakan dan isian tindak lanjut. Seluruh sheet/slide diperiksa.
5. Baseline lulus TypeScript, 67 pengujian, build dan UI desktop/ponsel. Branch `feat/odoo-handover-parity` yang sudah ada di VM digabungkan untuk mempertahankan approval. Rilis gabungan lulus 73 pengujian dan build; UI gabungan diperiksa ulang.
6. Selesai: panduan agen/Context7 dan repository diperbarui, source dipindai, commit dan push. PR #1 mempunyai reviewer/assignee gunavault, tetap terbuka untuk review.
7. Berjalan: penerapan gabungan pada VM existing, backup/migrasi aman, smoke API/browser HTTPS publik dan restore. Penerapan pertama ditahan pengujian karena source VM lebih baru dari main; aplikasi sebelumnya dipulihkan tanpa reset database.

## Aturan sumber

Data/laporan tetap privat di data/ dan outputs/. Workbook, karyawan, dump, password dan laporan nyata tidak masuk Git publik. DEMO dipisahkan. Estimasi dan sumber historis berbeda dari ledger POSTED. Nilai kosong atau selisih tidak dikoreksi tanpa bukti dan persetujuan pemilik proses.
