# Rencana ERP v4 ? 19 November 2026

## Tujuan aktif

Periksa kembali seluruh nominal dan hubungan transaksi/master terhadap enam workbook dan makalah/panduan yang disediakan. Tambahkan 4?6 kartu pada setiap modul. Serahkan daftar kekosongan data dalam Excel dan PowerPoint. Lakukan QA UI dan fungsi. Semua perubahan melalui branch dan PR di gunavault/kuncigroup dengan reviewer gunavault.

## Urutan

1. Ambil baseline GitHub, baca AGENTS dan dokumentasi Next/Context7. Selesai: main 132f070, branch codex/erp-v4-module-kpis-data-audit, Context7 telah dipakai.
2. Ambil snapshot produksi privat tanpa password/token. Cocokkan hash sumber dan makalah, periksa nominal secara independen, identitas, stok, relasi, dan input kosong.
3. Terapkan 4?6 KPI server per modul dengan scope perusahaan/cabang/pengguna, jumlah penuh dan uang Decimal/sen. Uji katalog bersama pada filter cabang.
4. Susun workbook rincian kekosongan, rekonsiliasi dan pemilik tindak lanjut; susun presentasi ringkas dengan bukti yang sama. Jangan mengisi nilai kosong secara spekulatif.
5. Jalankan typecheck, integration test, build, uji browser desktop/ponsel, serta pembatasan akses dan filter. Koreksi temuan nyata.
6. Dokumentasikan setup agen, Context7 dan workflow pull/PR. Scan rahasia/data pribadi, fetch ulang, commit, push branch, buat PR dan minta review gunavault.
7. Terapkan pembaruan yang sudah diotorisasi pada VM yang sama dengan backup, uji publik dan restore; serahkan hasil dan batas data yang belum disahkan HR/Finance.

## Pengamanan sumber

Data dan keluaran laporan tetap privat di data/ dan outputs/. Tidak memasukkan workbook, karyawan, dump, password atau laporan nyata ke repository publik. DEMO dipisahkan dari angka bisnis. Sumber/laporan estimasi tetap berbeda dari ledger posted.


## Status pelaksanaan

Langkah 1?3 selesai. TypeScript, 67 pengujian integrasi dan build lulus. Uji desktop/ponsel 19 modul serta 7 kelompok regresi UI lulus. Langkah 4 memfinalisasi Excel/PPT privat dan pemeriksaan visual. Langkah 5?7: pemeriksaan akhir, PR/reviewer, lalu penerapan dan verifikasi publik. Snapshot mentah tetap di server; hanya hasil temuan/agregat yang diambil untuk laporan.
