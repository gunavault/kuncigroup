"use client";
import { useEffect, useState } from "react";
import type { MiniDashboard } from "@/lib/operations/mini-dashboard";
import { rupiah } from "@/lib/money";

export function ModuleMiniDashboard({ company, module, branch = "", query = "", period = "", revision = "" }: { company: string; module: string; branch?: string; query?: string; period?: string; revision?: object | string | number }) {
  const [result, setResult] = useState<MiniDashboard | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError("");
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ view: "module-kpis", company, module });
        if (branch) p.set("branch", branch); if (query) p.set("q", query); if (period) p.set("period", period);
        const r = await fetch(`/api/operations?${p}`, { cache: "no-store", signal: controller.signal });
        const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Ringkasan belum tersedia.");
        if (!controller.signal.aborted) setResult(data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Ringkasan belum tersedia."); }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [company, module, branch, query, period, revision, retry]);
  return <section className="module-mini-dashboard" data-module={module} aria-label="Ringkasan modul" aria-busy={!result && !error}>
    <div className="module-mini-heading"><span>Ringkasan modul</span><small>{result?.scope ?? (error ? "Ringkasan belum tersedia" : "Memuat ringkasan…")}</small></div>
    {error ? <div className="alert error" role="alert">{error}<button type="button" onClick={() => setRetry(n => n + 1)}>Coba lagi</button></div> : <div className="module-mini-grid">
      {(result?.cards ?? Array.from({ length: 6 }, (_, i) => ({ key: String(i), label: "Memuat…", value: null, format: "count", detail: "" }))).map(card => <article key={card.key} className="module-mini-card" title={card.detail}>
        <span>{card.label}</span><strong>{card.value === null ? "—" : card.format === "money" ? rupiah(card.value) : new Intl.NumberFormat("id-ID").format(Number(card.value))}</strong>
        <small>{card.value === null && result ? "Memerlukan hak akses terkait" : card.detail}</small>
      </article>)}
    </div>}
  </section>;
}
