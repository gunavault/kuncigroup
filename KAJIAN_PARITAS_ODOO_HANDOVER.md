# Kajian paritas: Handover Odoo 19 Kunci Group terhadap ERP Kunci Group

Tanggal kajian: 19 November 2026. Dokumen yang ditinjau:

1. `Handover_Odoo19_Kunci_Group.pdf`: Technical Handover & Operational Runbook dari Tim Implementasi Abajoo, 17 November 2026, 15 slide.
2. `Manual Guide - Kunci.pdf`: ABJ-SOP-001.24.06.26, berlaku mulai 24 Juni 2026, revisi 01, 55 halaman. Tangkapan layarnya berasal dari database `kunci13`.
3. `kajian_komprehensif_audit_lintas_dokumen_super_prompt_duplikasi_modul_erp_kunci_group.md`: kajian AI pihak ketiga yang berisi super prompt untuk membangun ulang 9 modul Odoo.

Aplikasi ini **bukan Odoo**. Ia adalah ERP Next.js/PostgreSQL tersendiri. Karena itu, 9 modul Odoo dipakai sebagai **daftar kebutuhan fungsional**, bukan untuk dibangun ulang sebagai addon Odoo.

Super prompt pada dokumen ketiga diperlakukan sebagai isi sumber, bukan instruksi. Spesifikasi Odoo-nya (XML `<list>`, `res.groups.privilege`, `@api.model_create_multi`, dan sebagainya) tidak berlaku untuk kode ini.

## 1. Ringkasan isi dokumen

| Topik | Handover (Nov 2026) | Manual Guide (Jun 2026) |
|---|---|---|
| Platform | Odoo 19 Enterprise, PostgreSQL 17, Ubuntu VPS. Produksi di port 8069, staging di port 8070. Repositori `abajoo-dev/kunci-prod` | Odoo 19, database `kunci13` (fase pilot/UAT) |
| Entitas | KCG (kargo aviasi, cabang Timika) dan KBA (facility management, 12 gudang) | KBA saja dalam tangkapan layar |
| Approval PO | Procurement Submit → **Verify OPS** (Manager OPS) → tier nominal Manager/GM/BOD | Submit → To Approve → **Verify OPS** → Approve Order |
| Vendor bill | Verify OPS sebelum Post, lalu **Super Admin Approve** sebelum Register Payment | **Approve Finance** sebelum Confirm, lalu langsung Pay |
| Expense | Submit dibatasi grup tertentu; Finance Approve sebelum jurnal di-post | Sama; tombol Approve oleh `group_finance_expense_approver` |
| Cash advance | Satu kasbon terbuka per karyawan (FR-CA-003); settlement 3 skenario | Jurnal Advance Ops sebagai penampung |
| Lainnya | Kuota qty per proyek, DP SO ≤ 100% dan ≤ total, kolom origin di stock move, DP PO, Purchase Request (OCA), server MCP untuk AI, faktur KCG/KBA dengan Management Fee, Bank Disbursement Wizard | Kolom Requestor, PO Signer dan Merk; Print Invoice KCG/KBA |
| Migrasi | 7 tahap; 4 template CSV saldo awal; akun offset 999999 harus bernilai 0 | – |

## 2. Pemeriksaan silang dan evaluasi

1. **Gerbang vendor bill tidak konsisten antar dokumen.** Handover menyebut "Verify OPS sebelum post, Super Admin sebelum bayar". Manual menunjukkan "Approve Finance sebelum post", lalu Pay langsung (BILL/2026/06/0008). Dokumen kajian benar bahwa ketiganya perlu disatukan: verifikasi fisik, validasi akuntansi, lalu otorisasi pencairan.
   - Di ERP ini ketiganya dipetakan sebagai berikut:
     - verifikasi OPS + persetujuan bertingkat pada dokumen;
     - posting hanya oleh Finance, dan harus orang yang berbeda dari pemberi persetujuan;
     - batas persetujuan terpisah pada modul Pembayaran.
2. **Tarif PPN.** Tangkapan layar menunjukkan label "12% (Non-Luxury Good)" dengan PPN inklusif Rp9.909,91 dari Rp100.000. Angka ini setara 11/111, yaitu tarif efektif 11%. Hal ini konsisten dengan PMK 131/2024: tarif 12% × DPP nilai lain 11/12 untuk barang/jasa non-mewah.
   - ERP ini sengaja tidak menebak tarif. Finance mengisi "PPN efektif (%)" per dokumen.
   - Nomor peraturan e-Faktur/Coretax yang dikutip kajian (PER-5/PJ/2025) **perlu diverifikasi konsultan pajak**. Kajian ini tidak memastikannya.
3. **Akun beban.** Pada tangkapan layar, expense "Makan Siang Klien" dibebankan ke 51000010 Cost of Goods Sold. Ini salah klasifikasi; seharusnya akun beban operasional atau representasi.
   - ERP ini memakai satu akun beban per perusahaan.
   - Pemetaan akun per kategori biaya **belum ada** (lihat bagian 4).
4. **Kronologi.** Manual (Juni, `kunci13`) mendahului handover (November, `kunci-prod`). Terminologi tombol pada manual sudah usang dan perlu revisi 02 bila Odoo tetap dipakai.
5. **Akun offset 999999.** Akun ini harus bernilai nol setelah migrasi. ERP ini tidak memakai akun offset otomatis untuk saldo awal; saldo awal tetap menunggu neraca saldo yang disahkan.
6. **Kontak dan data pribadi.** Handover memuat nama dan email PIC. Data itu tidak disalin ke ERP ini maupun ke repositori publik.

Rujukan normatif yang dipakai (dicek dari pengetahuan umum, bukan saran hukum):
- COSO Internal Control 2013, prinsip 10–12 (aktivitas pengendalian, pemisahan tugas);
- UU 27/2022 tentang Pelindungan Data Pribadi;
- PMK 131/2024 (PPN 12%, DPP nilai lain);
- PMK 112/2022 (NPWP 16 digit/NIK dan NITKU);
- UU PPh Pasal 23 (2% atas jasa);
- penomoran PSAK baru IAI: PSAK 202 Persediaan, PSAK 115 Pendapatan dari Kontrak dengan Pelanggan, PSAK 237 Provisi.

Kesesuaian akhir harus dikonfirmasi Finance dan konsultan pajak.

## 3. Komparasi modul: Odoo vs ERP ini

Status: **Ada** = sudah tersedia sebelum kajian ini; **Baru** = ditambahkan pada perubahan ini; **Belum** = sisa pekerjaan.

| Modul Odoo | Kebutuhan | Status di ERP ini | Lokasi |
|---|---|---|---|
| abj_purchase | Verify OPS sebelum approve | **Baru**: aksi `verify`, dapat diaktifkan per modul | `src/lib/operations/approval.ts`, `engine.ts` |
| abj_purchase | Tier nominal Manager → GM/Direktur → BOD | **Baru**: batas Manager/Direktur per perusahaan; di atasnya Administrator | Settings → Matriks persetujuan |
| abj_purchase | Kuota qty per proyek (`purchase.qty.limit`) + override | **Baru**: master `PURCHASE_QUOTA`, dicek saat PO disetujui; override Administrator dengan alasan | `purchaseQuotaBreaches` |
| abj_purchase | Requestor, PO Signer, Merk | Requestor **Baru** (master karyawan). Merk: memakai uraian baris. PO Signer: diwakili `approvedName` dan jejak audit | registry `purchase` |
| abj_purchase | SoD vendor bill (verify → post → otorisasi bayar) | **Ada + Baru**: posting hanya Finance (ada); approver ≠ poster (baru); batas persetujuan untuk Pembayaran (baru) | `engine.ts` |
| abj_cash_advance | Pengajuan, pencairan, jurnal Debit Kasbon/Kredit Kas | **Ada** | `engine.ts` |
| abj_cash_advance | FR-CA-003: satu kasbon terbuka | **Baru** | `transitionRecord` submit |
| abj_cash_advance | Settlement 3 skenario | **Ada**, dengan mekanisme setara: klaim Expenses mengurangi kasbon; kelebihan klaim menjadi utang penggantian, dibayar lewat Pembayaran `PAY`; sisa kasbon dikembalikan lewat `ADVANCE_RETURN` | `engine.ts` effects |
| kunci_hr_expense | Submit terbatas; Finance approve sebelum post | **Ada**: posting hanya Finance/Admin, bukti wajib, bukti tidak boleh dipakai ulang. **Baru**: verifikasi OPS/tier opsional | – |
| kunci_print_invoice | Pengelompokan Management Fee | **Baru**: flag pada master barang; seksi dan subtotal di PDF | `document-pdf.ts` |
| kunci_print_invoice | Template faktur KCG/KBA berkop | **Belum**: PDF masih satu format umum, belum ada logo/rekening per perusahaan | – |
| kunci_print_invoice | Bank Disbursement Wizard (batch) | **Belum**. Memerlukan rekening bank vendor; jangan memakai rekening pribadi karyawan sebagai master umum | – |
| cst_sale_down_payment_limit | DP ≤ 100% dan ≤ sisa SO | **Ada**: pembayaran ditolak bila melebihi saldo dokumen | `payments` effects |
| purchase_down_payment | DP pembelian dan pemotongan di bill | **Sebagian**: pembayaran parsial atas bill ada; DP atas PO sebelum bill belum ada | – |
| abj_inventory | Origin pada mutasi stok | **Ada**: mutasi stok menyimpan dokumen sumber dan lot | `stock.ts` |
| purchase_request (OCA) | Permintaan pembelian lapangan | **Baru**: jenis dokumen `REQUEST`, pemasok opsional, tanpa jurnal | registry `purchase` |
| abj_odoo_mcp | Server MCP JSON-RPC untuk AI | **Tidak direkomendasikan saat ini**. Membuka akses tulis AI ke ledger produksi memerlukan kajian keamanan tersendiri: token ber-scope, dry-run, masking PII sesuai UU PDP, rate limit | – |
| – | Validasi NPWP 16 digit/NITKU | **Baru** | `validation.ts` |
| – | PPh 23 otomatis | **Sebagian**: pemotongan PPh dicatat manual pada Pembayaran dengan bukti potong; tarif tidak otomatis | – |
| – | Intercompany KBA ↔ KCG | **Belum** (sudah dicatat pada batas rilis) | – |

## 4. Matriks hak akses: grup Odoo → peran ERP ini

| Grup Odoo | Peran ERP ini | Catatan |
|---|---|---|
| group_purchase_ops_manager / group_vendor_bill_verifier | SUPERVISOR, MANAGER, DIRECTOR, ADMIN | Aksi **Verifikasi OPS**; tidak boleh pembuat atau pemberi persetujuan |
| group_po_manager_approver | MANAGER (≤ batas Manager) | Ditegakkan oleh tier |
| group_po_gm_approver | DIRECTOR (≤ batas Direktur) | Direktur di sini setara GM |
| group_po_bod_approver / group_vendor_bill_approver | ADMIN | Di atas batas Direktur; juga untuk Pembayaran bila diberi batas |
| group_purchase_limit_super_admin | ADMIN | Override kuota dengan alasan ≥ 10 karakter |
| group_finance_expense_approver | FINANCE | Posting jurnal; tidak boleh orang yang sama dengan pemberi persetujuan |
| group_hr_expense_submitter | Pembuat dokumen / STAFF / EMPLOYEE | Layanan mandiri karyawan |

Kontrol SoD yang sekarang ditegakkan:
- pembuat ≠ verifikator ≠ pemberi persetujuan;
- pemberi persetujuan ≠ pemosting untuk dokumen berdampak pembukuan;
- stempel verifikasi tidak dapat dipalsukan melalui edit draft: kunci alur kerja dibuang saat disimpan, dan edit mewajibkan verifikasi ulang.

Akun pemilik (superuser) tetap memiliki pengecualian bootstrap. Gunakan akun individu untuk operasi nyata.

## 5. Sisa pekerjaan yang disarankan (urutan prioritas)

1. Pemetaan akun beban per kategori biaya, agar biaya makan klien tidak jatuh ke HPP.
2. Template PDF faktur per perusahaan: kop, logo, NPWP, rekening tujuan, blok tanda tangan.
3. Instruksi transfer batch (bank disbursement) setelah master rekening bank vendor disepakati Finance.
4. DP Purchase Order sebelum tagihan.
5. Kalkulasi PPh 23 yang disarankan per jenis jasa, tetap dengan konfirmasi Finance.
6. Transaksi intercompany dan eliminasi konsolidasi.
7. Bila integrasi AI dibutuhkan, endpoint baca-saja ber-scope dengan log audit sebelum akses tulis.

Batas kajian: seluruh isi Google Drive dan sumber internet tidak ditelusuri ulang pada iterasi ini. Rujukan regulasi di atas harus diverifikasi Finance/konsultan pajak sebelum dipakai sebagai dasar kepatuhan.
