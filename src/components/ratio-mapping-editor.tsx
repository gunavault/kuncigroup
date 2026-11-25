"use client";
import { useEffect, useState } from "react";
import { ratioMappingFields, suggestRatioMapping } from "@/lib/ratio-mapping";
import type { AppState } from "./operation-workspace";
export function RatioMappingEditor({ state, onSubmit }: { state: AppState; onSubmit: (d: unknown) => Promise<void> }) {
  const [accounts, setAccounts] = useState<Parameters<typeof suggestRatioMapping>[0]>([]), [mapping, setMapping] = useState<Record<string, string[]>>({}), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => { const c = new AbortController(); setError(""); setNotice(""); setMapping(((state.company.settings.accounting as Record<string, unknown> | undefined)?.ratios ?? {}) as Record<string, string[]>);
    fetch(`/api/operations?view=accounts&company=${state.company.id}`, { signal: c.signal }).then(async r => { const b = await r.json(); if (!r.ok) throw Error(b.error ?? "Akun gagal dimuat."); if (!c.signal.aborted) setAccounts(b.accounts); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort();
  }, [state.company.id, state.company.settings.accounting]);
  return <section className="panel" aria-label="Tinjauan pemetaan rasio"><div className="panel-heading"><div><h2>Tinjauan pemetaan rasio oleh Finance</h2><p>Usulan dari kode/nama akun memerlukan pemeriksaan substansi: lancar, likuid, tenor pinjaman, bunga, dan penjualan kredit. Menyimpan tinjauan tidak membuat jurnal.</p></div></div>
    {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="note" role="status">{notice}</p>}
    <form className="form-grid" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(""); try { await onSubmit({ action: "ratioMapping", companyId: state.company.id, mapping, confirmed: f.get("confirmed") === "on", note: f.get("note") }); setNotice("Pemetaan ditinjau dan dicatat. Buka kembali laporan untuk menghitung rasio."); } catch (e) { setError(e instanceof Error ? e.message : "Tinjauan gagal."); } finally { setBusy(false); } }}>
      <div className="full-width"><button type="button" className="button button-outline" disabled={busy || !accounts.length} onClick={() => setMapping(suggestRatioMapping(accounts))}>Usulkan klasifikasi dari bagan akun</button><p className="muted">Akun khusus penjualan kredit tidak diisi otomatis. Kosong berarti belum tersedia.</p></div>
      {ratioMappingFields.map(field => <label key={field.key}>{field.label}<select aria-label={`Tinjauan rasio: ${field.label}`} multiple size={5} value={mapping[field.key] ?? []} onChange={e => { const selected = Array.from(e.target.selectedOptions).map(o => o.value); setMapping(m => ({ ...m, [field.key]: selected })); }}>{accounts.filter(a => a.category === field.category).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>)}
      <label className="full-width">Dasar klasifikasi / rujukan bukti<textarea name="note" required minLength={20} maxLength={2000} /></label>
      <label className="inline-check full-width"><input type="checkbox" name="confirmed" required />Saya telah meninjau klasifikasi akun dan sumber penjualan kredit; pilihan yang belum terbukti tetap kosong.</label>
      <div className="panel-footer full-width"><button className="button" disabled={busy}>Simpan tinjauan pemetaan</button></div>
    </form>
  </section>;
}
