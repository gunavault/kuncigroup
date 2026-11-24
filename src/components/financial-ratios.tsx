"use client";
import { useEffect, useState } from "react";
import type { financialRatios } from "@/lib/financial-ratios";
import type { TraceSelection } from "./financial-trace";
type Ratios = Awaited<ReturnType<typeof financialRatios>>;
export function FinancialRatios({ company, period, onTrace }: { company: string; period: string; onTrace: (s: TraceSelection) => void }) {
  const [data, setData] = useState<Ratios | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    fetch(`/api/financial-ratios?${new URLSearchParams({ company, period })}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Rasio gagal dimuat."); if (!controller.signal.aborted) setData(b); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Koneksi gagal."); });
    return () => controller.abort();
  }, [company, period, retry]);
  return <section className="panel" aria-label="Rasio keuangan dan operasional"><div className="panel-heading"><div><h2>Rasio keuangan & operasional</h2><p>{data?.basis ?? "Menggunakan periode dan perusahaan terpilih."}</p></div></div>
    {error && <p className="alert" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Coba lagi</button></p>}
    {!data && !error && <p className="empty" role="status">Menghitung rasio dari buku besar…</p>}
    {data && <><div className="ratio-grid">{data.ratios.map(r => <article className="ratio-card" key={r.key}>
      <small>{r.group}</small><h3>{r.label}</h3><strong>{r.value === null ? "Belum tersedia" : `${Number(r.value).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.unit}`}</strong>
      <p>{r.formula}</p>{r.reason && <p className="ratio-reason">{r.reason}</p>}
      <details><summary>Dasar perhitungan</summary><p>Pembilang: {r.numerator}<br />Penyebut: {r.denominator}</p><p>{r.basis}</p>{r.trace && <button className="trace-link" onClick={() => onTrace({ ...r.trace!, label: `Dasar ${r.label}` })}>Telusuri komponen buku besar</button>}{r.traces?.map(t => <p key={t.label}><button className="trace-link" onClick={() => onTrace(t)}>{t.label}</button></p>)}</details>
    </article>)}</div><ul className="narrative">{data.notes.map(n => <li key={n}>{n}</li>)}</ul></>}
  </section>;
}
