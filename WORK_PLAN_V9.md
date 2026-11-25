# Rencana penyelesaian dashboard dan siklus akuntansi jasa

25 November 2026. Melanjutkan perubahan v7/v8 dari agent lain dan perbaikan kontrol v8.1 dalam branch `codex/v8-1-audit-reconciliation`.

## Temuan yang sudah dibuktikan

- Cloud cocok dengan 84 file source baseline `eb1cf35`; layanan aktif. Ada 2.002 jurnal KBA yang seimbang, tetapi 238 invoice dan 392 kasbon KBA masih berstatus IMPORTED. Kartu operasional membaca register dokumen tersebut, sehingga nol posting bukan berarti buku besar kosong.
- Seluruh jurnal historis KBA belum memiliki alokasi cabang. Angka perusahaan tidak boleh dibagikan ke site dengan tebakan.
- Ada 190 baris saldo stok sumber. Belum ada lot stok operasional yang diposting. Biaya perolehan, bukti fisik dan lot/kedaluwarsa tidak boleh dibuat untuk menghilangkan nol.
- Rekap invoice Drive revisi 23 November mengubah 13 baris bisnis. Dua belas sesuai penerbit eksplisit, satu konflik penerbit. Versi ini sudah ditahan untuk tinjauan lokal dan belum ada di cloud.
- Kajian baru dibaca sebagai referensi kebutuhan. Pernyataan regulasi/standar di dalamnya perlu diverifikasi; isinya tidak memberi persetujuan posting atau sign-off.

## Pekerjaan yang harus dituntaskan

1. Perbaiki sumber kartu: pisahkan saldo buku besar, dokumen workflow, sumber impor dan data yang belum tersedia. Sediakan periode, lokasi bukti dan jalur penelusuran. Nol yang benar tetap nol.
2. Cari dan cocokkan bukti Drive terbaru. Impor inkremental sebagai sumber tinjauan; pertahankan jurnal historis dan cegah duplikasi.
3. Lengkapi kebutuhan kajian: AR/AP aging dan rekonsiliasi ke akun kontrol, biaya langsung jasa dan rasio tenaga kerja, profit per site dengan pos belum teralokasi, budget/actual chemical, rencana kas talangan, CaLK dan kerangka pelaporan, serta bantuan penyusunan jurnal penyesuaian berbukti. Data yang belum ada harus memiliki alasan dan kolom tindak lanjut.
4. Tuntaskan kontrol rekonsiliasi bank dan tinjauan pemetaan rasio yang sudah dibuat. Penandatangan bisnis tetap pengguna Finance/Direksi yang berwenang.
5. Uji unit/integrasi dan SIT, UI desktop/ponsel, filter/form/button, ekspor, RBAC dan regresi 19 modul. Bedakan simulasi UAT dari persetujuan bisnis nyata.
6. Perbarui rekap kekosongan Excel/PPT berdasarkan snapshot cloud terbaru. Jaga data privat di luar Git publik.
7. Push kode dan PR untuk `gunavault`, deploy pada VM existing dengan backup, PAT dan uji restore terpisah. Sinkronkan workspace lokal tanpa menimpa perubahan lain.
