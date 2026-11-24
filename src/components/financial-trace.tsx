"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import { rupiah } from "@/lib/money";
import type { financialTrace } from "@/lib/financial-trace";

export type TraceSelection = { statement: string; metric?: string; account?: string; journal?: string; document?: string; label: string; page?: number; period?: string; entryType?: string };
const fieldLabels: Record<string, string> = { documentType: "Jenis dokumen", dueDate: "Tanggal jatuh tempo", purpose: "Keperluan", projectId: "Proyek", partnerId: "Pelanggan / pemasok", employeeId: "Karyawan", operation: "Jenis operasi", warehouseId: "Gudang", reason: "Alasan", reviewNote: "Catatan tinjauan", attachmentId: "Lampiran bukti", referenceId: "Referensi dokumen", refId: "Referensi", orderId: "Pesanan", invoiceId: "Invoice", purchaseId: "Pembelian", requestId: "Permintaan", workOrderId: "Perintah kerja", sourceRecordId: "Dokumen sumber", advanceId: "Kasbon", shiftRecordId: "Sif", closeRecordId: "Penutupan" };
type Result = Awaited<ReturnType<typeof financialTrace>>;
const evidence = (file: { name: string; url: string | null } | null | undefined) => file?.url
  ? <a href={file.url} target="_blank" rel="noopener noreferrer">{file.name} <ExternalLink size={12} /></a>
  : <span>{file?.name ?? "Sumber belum ditautkan"}</span>;

export function FinancialTrace({ company, period, selection, onClose }: { company: string; period: string; selection: TraceSelection; onClose: () => void }) {
  const [history, setHistory] = useState<TraceSelection[]>([selection]);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  const current = history[history.length - 1];
  useEffect(() => { close.current?.focus(); const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    const p = new URLSearchParams({ company, period: current.period ?? period, statement: current.statement });
    for (const key of ["metric", "account", "journal", "document", "page", "entryType"] as const) if (current[key] !== undefined) p.set(key, String(current[key]));
    fetch(`/api/financial-trace?${p}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "Penelusuran gagal."); if (!controller.signal.aborted) setResult(body); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Koneksi gagal."); });
    return () => controller.abort();
  }, [company, period, current, retry]);
  const down = (next: TraceSelection) => setHistory(h => [...h, next]);
  const page = (n: number) => setHistory(h => [...h.slice(0, -1), { ...current, page: n }]);
  return <div className="modal-backdrop trace-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="panel trace-dialog" role="dialog" aria-modal="true" aria-labelledby="trace-title" onKeyDown={e => {
      if (e.key !== "Tab") return;
      const nodes = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]');
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <div className="panel-heading"><div><h2 id="trace-title">Telusur laporan → bukti sumber</h2><p>{result?.company.name ?? company} · {result?.period.name ?? "Periode terpilih"}</p></div><button ref={close} className="icon-button" onClick={onClose} aria-label="Tutup penelusuran"><X size={20} /></button></div>
      <nav className="trace-breadcrumb" aria-label="Jejak penelusuran">{history.map((h, i) => <span key={i}>{i > 0 && <ChevronRight size={14} />}<button className="trace-link" disabled={i === history.length - 1} onClick={() => setHistory(v => v.slice(0, i + 1))}>{h.label}</button></span>)}</nav>
      <div className="trace-body">
        {history.length > 1 && <button className="button button-outline" onClick={() => setHistory(h => h.slice(0, -1))}><ArrowLeft size={14} /> Naik satu tingkat</button>}
        {error && <div className="alert" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Coba lagi</button></div>}
        {!result && !error && <p role="status"><Loader2 className="spin" size={18} /> Memuat buku besar dan sumber…</p>}
        {result && result.level === "DOCUMENT" && <>
          <h3>{result.record.number} · {result.record.title}</h3><p>{result.record.module} · {result.record.date} · {result.record.status} · {rupiah(result.record.amount)}</p>
          {result.journal && <button className="trace-link" onClick={() => down({ statement: "JOURNAL", journal: result.journal!.id, period: result.journal!.fiscalPeriodId, label: result.journal!.journalNumber })}>Buka jurnal terkait</button>}
          <div className="table-scroll"><table><tbody>{Object.entries(result.record.fields).map(([k, v]) => { const master = result.masters.find(m => m.id === v); return <tr key={k}><td>{fieldLabels[k] ?? k}</td><td>{master ? `${master.code} · ${master.name}` : typeof v === "object" ? JSON.stringify(v) : String(v)}</td></tr>; })}</tbody></table></div>
          <div className="table-scroll"><table><thead><tr><th>Uraian</th><th className="num">Kuantitas</th><th className="num">Harga</th><th className="num">Nilai</th></tr></thead><tbody>{result.record.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{rupiah(l.unitPrice)}</td><td className="num">{rupiah(l.total)}</td></tr>)}</tbody></table></div>
          <p>{evidence(result.source)}{result.source?.row ? ` · baris ${result.source.row}` : ""}</p>
          {result.attachment && <p><a href={`/api/files?id=${encodeURIComponent(result.attachment.id)}`}>Unduh {result.attachment.name}</a></p>}
          <a className="button button-outline" href={`/api/documents?company=${encodeURIComponent(company)}&id=${encodeURIComponent(result.record.id)}`} target="_blank" rel="noopener noreferrer">Cetak dokumen</a>
          {result.sourceNote && <p className="note">{result.sourceNote}</p>}
          <h3>Dokumen berelasi eksplisit</h3>{!result.related.length && <p>Belum ada tautan PO/WO/invoice/dokumen terkait.</p>}
          {result.related.map(d => <p key={d.id}><button className="trace-link" onClick={() => down({ ...current, document: d.id, label: d.number })}>{d.number} · {d.module} · {d.status}</button></p>)}
          {result.relatedTruncated && <p className="note">Menampilkan 50 relasi terdekat. Lanjutkan melalui dokumen terkait.</p>}
        </>}
        {result && result.level !== "DOCUMENT" && <>
          <div className="trace-summary"><h3>{result.title}</h3><strong>{result.statement === "JOURNAL" && result.level === "JOURNAL" && !current.account ? "Selisih D − K: " : "Kontribusi: "}{rupiah(result.value)}</strong><small>{result.basis}</small></div>
          {result.level === "STATEMENT" && <div className="table-scroll"><table><thead><tr><th>Akun buku besar</th><th className="num">Kontribusi</th></tr></thead><tbody>{result.accounts.map(a => <tr key={a.id}><td><button className="trace-link" onClick={() => down({ ...current, account: a.id, page: 0, label: `${a.code} ${a.name}` })}>{a.code} · {a.name}</button></td><td className="num">{rupiah(a.value)}</td></tr>)}</tbody></table></div>}
          <h3>{result.level === "JOURNAL" ? "Rincian jurnal" : `Jurnal pembentuk · ${result.total} jurnal`}</h3>
          {result.level !== "JOURNAL" && <div className="table-scroll"><table><thead><tr><th>Nomor jurnal</th><th>Tanggal</th><th>Uraian</th><th className="num">Kontribusi pos</th></tr></thead><tbody>{result.journals.map(j => <tr key={j.id}><td><button className="trace-link" onClick={() => down({ ...current, journal: j.id, page: 0, label: j.number })}>{j.number}</button></td><td>{j.date}</td><td>{j.description}</td><td className="num">{rupiah(j.contribution)}</td></tr>)}</tbody></table></div>}
          {result.level === "JOURNAL" && result.journals.map(j => <div key={j.id}>
            <p>{j.number} · {j.date} · {j.status} · {j.type}</p><p>{j.description}</p>
            {j.reportLinks.length > 0 && <div className="actions"><span>Naik ke laporan:</span>{j.reportLinks.map(link => <button key={link.label} className="trace-link" onClick={() => down({ ...link, period: current.period })}>{link.label}</button>)}</div>}
            {j.status !== "POSTED" && <p className="note">Jurnal ini belum diposting dan tidak masuk laporan keuangan.</p>}
            <div className="table-scroll"><table><thead><tr><th>Akun</th><th>Uraian</th><th className="num">Debit</th><th className="num">Kredit</th></tr></thead><tbody>{j.lines.map(l => <tr key={l.id}><td>{l.code} · {l.name}</td><td>{l.description}</td><td className="num">{rupiah(l.debit)}</td><td className="num">{rupiah(l.credit)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Total</th><th className="num">{rupiah(j.debit)}</th><th className="num">{rupiah(j.credit)}</th></tr></tfoot></table></div>
            <h3>Dokumen operasional</h3>{j.documents.map(d => <p key={d.id}><button className="trace-link" onClick={() => down({ ...current, document: d.id, label: d.number })}>{d.number} · {d.module} · {d.status}</button></p>)}
            {!j.documents.length && <p>Belum ada dokumen operasional yang ditautkan langsung.</p>}
            <h3>Jejak sumber jurnal</h3>{j.sources.map(s => <p key={s.id}>{evidence(s.file)} · sheet {s.sheet} · baris {s.row}{s.reference ? ` · referensi ${s.reference}` : ""}</p>)}
            {j.sourceDocuments.map(s => <p key={s.id}>{evidence(s.file)} · sheet {s.sheet} · baris {s.row} · {s.documentNumber} · {s.match === "REFERENSI_TEPAT" ? "Nomor referensi tepat; bukti perlu diperiksa" : "Nomor berulang; perlu verifikasi"}</p>)}
            <h3>Register bukti transaksi</h3>{j.evidenceRegister.map(b => <p key={b.id}>BUKTI no. {b.row} · {b.type} · {b.document || "–"} · {b.date} · {b.party || "–"}{b.amount ? ` · ${rupiah(b.amount)}` : ""} · rujukan {b.pointer} · pemeriksaan: {b.review} · kelengkapan: {b.completeness}</p>)}
            {!j.evidenceRegister.length && <p>Belum ada baris register bukti (sheet BUKTI) yang tertaut ke jurnal ini.</p>}
            {j.attachment && <p><a href={`/api/files?id=${encodeURIComponent(j.attachment.id)}`}>Unduh {j.attachment.name}</a></p>}
            {j.evidenceUrls.map((url, i) => <p key={url}><a href={url} target="_blank" rel="noopener noreferrer">Rujukan bukti pada uraian {i + 1} <ExternalLink size={12} /></a></p>)}
            {j.sourceNote && <p className="note">{j.sourceNote}</p>}
          </div>)}
          {!result.total && <p className="empty">Belum ada jurnal untuk pos ini.</p>}
          {result.level !== "JOURNAL" && result.total > result.pageSize && <div className="actions trace-pagination"><button className="button button-outline" disabled={result.page === 0} onClick={() => page(result.page - 1)}>Sebelumnya</button><span>Halaman {result.page + 1} / {Math.ceil(result.total / result.pageSize)} · total tetap mencakup seluruh halaman</span><button className="button button-outline" disabled={(result.page + 1) * result.pageSize >= result.total} onClick={() => page(result.page + 1)}>Berikutnya</button></div>}
        </>}
      </div>
    </section>
  </div>;
}
