export const adjustmentGuides = [
  { code: "ACCRUAL_PAYROLL", label: "Akrual gaji dan lembur", evidence: "Absensi/lembur tervalidasi, daftar payroll bruto, periode cut-off dan persetujuan." },
  { code: "ACCRUAL_THR", label: "Akrual / provisi THR", evidence: "Hak dan masa kerja yang terbukti, dasar perhitungan THR serta kebijakan/ketentuan yang berlaku." },
  { code: "ACCRUAL_BPJS_TAX", label: "Akrual BPJS dan pajak", evidence: "Daftar gaji bruto, tagihan BPJS/bukti potong, perhitungan terverifikasi dan akun utang terkait." },
  { code: "UNBILLED", label: "Pendapatan jasa belum ditagih", evidence: "Kontrak/SPK, BAST/timesheet yang membuktikan penyerahan jasa, nilai yang dapat diukur dan status invoice." },
  { code: "CONSUMPTION", label: "Pemakaian chemical / perlengkapan", evidence: "Mutasi gudang, stock opname, bukti pemakaian per site dan biaya unit terverifikasi." },
  { code: "DEPRECIATION", label: "Penyusutan aset perusahaan", evidence: "Kepemilikan aset, biaya/tanggal perolehan, masa manfaat, nilai residu dan kebijakan penyusutan. Aset klien tidak disusutkan oleh perusahaan." },
  { code: "IMPAIRMENT", label: "Penurunan nilai piutang", evidence: "Aging, bukti penagihan, risiko kredit dan dasar penurunan nilai sesuai kerangka pelaporan entitas." },
  { code: "PREPAID", label: "Alokasi beban dibayar di muka", evidence: "Kontrak/polis/sewa, periode manfaat, biaya terverifikasi dan alokasi per periode/site." },
] as const;
