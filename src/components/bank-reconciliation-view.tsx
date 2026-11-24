"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { rupiah } from "@/lib/money";
import type { bankReconciliation } from "@/lib/bank-reconciliation";
import type { TraceSelection } from "./financial-trace";

type Rec = Awaited<ReturnType<typeof bankReconciliation>>;
const PAGE = 50;

export function BankReconciliationView({ company, periodId, onTrace }: { company: string; periodId: string; onTrace: (s: TraceSelection) => void }) {
  const [account, setAccount] = useState(""),
    [data, setData] = useState<Rec | null>(null),
    [error, setError] = useState(""),
    [side, setSide] = useState<"bank" | "book">("bank"),
    [month, setMonth] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/operations?${new URLSearchParams({ company, view: "bank-reconciliation", period: periodId, ...(account ? { account } : {}) })}`, { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Rekonsiliasi gagal dimuat.");
        if (!c.signal.aborted) setData(b);
      })
      .catch((e) => !c.signal.aborted && setError(e instanceof Error ? e.message : "Koneksi gagal."));
    return () => c.abort();
  }, [company, periodId, account]);
  if (error) return <div className="alert" role="alert">{error}</div>;
  if (!data) return <div className="empty" role="status"><Loader2 className="spin" size={16} /> Mencocokkan rekening koran dengan buku besar…</div>;
  const rec = data.account ? (data as Extract<Rec, { perMonth: unknown }>) : null;
  const list = rec ? (side === "bank" ? rec.statementOnly : rec.bookOnly).filter((x) => !month || x.date.startsWith(month)) : [];
  return (
    <>
      <section className="panel" aria-label="Cakupan rekening koran">
        <div className="panel-heading">
          <div>
            <h2>Cakupan rekening koran · {data.period.name}</h2>
            <p>Akun kas/bank bersaldo dan jumlah baris rekening koran yang sudah diimpor dari Google Drive.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Akun</th><th className="num">Saldo buku</th><th className="num">Baris koran</th><th></th></tr></thead>
            <tbody>
              {data.coverage.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong> {c.name}</td>
                  <td className="num">{rupiah(c.bookBalance)}</td>
                  <td className="num">{c.statementLines || "Belum ada"}</td>
                  <td>{c.statementLines > 0 ? <button className="trace-link" onClick={() => { setAccount(c.id); setPage(0); setMonth(""); }}>Rekonsiliasi</button> : <button className="trace-link" onClick={() => onTrace({ statement: "CASH_FLOW", metric: "ending", account: c.id, label: `${c.code} · ${c.name}` })}>Telusuri buku</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {rec && (
        <>
          <section className="panel" aria-label="Rekonsiliasi bank">
            <div className="panel-heading">
              <div>
                <h2>{rec.account!.code} · {rec.account!.name}</h2>
                <p>
                  Sumber: {rec.source?.url ? <a href={rec.source.url} target="_blank" rel="noreferrer">{rec.source.name}</a> : rec.source?.name ?? "–"} · koran s.d. {rec.statementThrough ?? "–"}
                  {!rec.coversPeriodEnd && " · rekening koran belum mencakup akhir periode"}. {rec.rule}
                </p>
              </div>
            </div>
            {(rec.breaks.length > 0 || rec.titleMismatches.length > 0) && (
              <ul className="narrative">
                {rec.breaks.map((b) => <li key={b.month}>Saldo awal koran {b.month} ({rupiah(String(b.opening))}) berbeda dengan saldo akhir bulan sebelumnya ({rupiah(String(b.previousClosing))}). Saldo koran di bawah dihitung dari mutasi; cocokkan dengan PDF bank.</li>)}
                {rec.titleMismatches.map((t) => <li key={t}>Judul sheet tidak sesuai isinya: {t}.</li>)}
                <li>Saldo awal koran {rupiah(rec.opening.statement)}; saldo awal buku akun ini {rupiah(rec.opening.book)} (saldo awal kertas kerja digabung di 11100).</li>
              </ul>
            )}
            <div className="kpi-grid">
              <div className="kpi"><span>Cocok</span><h2>{rec.totals.matched}</h2><small>{rupiah(rec.totals.matchedAmount)}</small></div>
              <div className="kpi"><span>Hanya di koran (belum dibukukan)</span><h2>{rec.totals.statementOnly}</h2><small>neto {rupiah(rec.totals.statementOnlyAmount)}</small></div>
              <div className="kpi"><span>Hanya di buku (tidak ada di koran)</span><h2>{rec.totals.bookOnly}</h2><small>neto {rupiah(rec.totals.bookOnlyAmount)}</small></div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Bulan</th><th className="num">Masuk koran</th><th className="num">Keluar koran</th><th className="num">Saldo koran</th><th className="num">Masuk buku</th><th className="num">Keluar buku</th><th className="num">Saldo buku</th><th className="num">Selisih buku − koran</th><th className="num">Cocok</th><th className="num">Hanya koran</th><th className="num">Hanya buku</th></tr>
                </thead>
                <tbody>
                  {rec.perMonth.map((m) => (
                    <tr key={m.month}>
                      <td><button className="trace-link" onClick={() => { setMonth(m.month); setPage(0); }}>{m.month}</button></td>
                      <td className="num">{rupiah(m.statement.inflow)}</td>
                      <td className="num">{rupiah(m.statement.outflow)}</td>
                      <td className="num">{m.statement.closingComputed === null ? "Belum ada koran" : rupiah(m.statement.closingComputed)}</td>
                      <td className="num">{rupiah(m.book.inflow)}</td>
                      <td className="num">{rupiah(m.book.outflow)}</td>
                      <td className="num">{rupiah(m.book.closing)}</td>
                      <td className="num strong">{m.difference === null ? "–" : rupiah(m.difference)}</td>
                      <td className="num">{m.matched}</td>
                      <td className="num">{m.statementOnly}</td>
                      <td className="num">{m.bookOnly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel" aria-label="Item belum cocok">
            <div className="panel-heading">
              <div>
                <h2>Item belum cocok {month && `· ${month}`}</h2>
                <p>Hanya di koran: belum dibukukan atau dibukukan ke akun bank lain. Hanya di buku: jurnal yang tidak terlihat di rekening ini — periksa akun bank pada jurnal.</p>
              </div>
              <div className="actions">
                <button className={`button ${side === "bank" ? "" : "button-outline"}`} onClick={() => { setSide("bank"); setPage(0); }}>Hanya di koran ({rec.totals.statementOnly})</button>
                <button className={`button ${side === "book" ? "" : "button-outline"}`} onClick={() => { setSide("book"); setPage(0); }}>Hanya di buku ({rec.totals.bookOnly})</button>
                {month && <button className="button button-outline" onClick={() => setMonth("")}>Semua bulan</button>}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Tanggal</th><th>Uraian</th><th className="num">Masuk</th><th className="num">Keluar</th><th>{side === "bank" ? "Lokasi di koran" : "Jurnal"}</th></tr></thead>
                <tbody>
                  {list.slice(page * PAGE, (page + 1) * PAGE).map((x) => (
                    <tr key={x.id}>
                      <td>{x.date}</td>
                      <td>{x.description || "–"}</td>
                      <td className="num">{x.inflow === "0.00" ? "" : rupiah(x.inflow)}</td>
                      <td className="num">{x.outflow === "0.00" ? "" : rupiah(x.outflow)}</td>
                      <td>{"journalId" in x ? <button className="trace-link" onClick={() => onTrace({ statement: "JOURNAL", journal: x.journalId, label: x.journalNumber })}>{x.journalNumber}</button> : `${x.sheet} · baris ${x.row}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!list.length && <div className="empty">Tidak ada item belum cocok.</div>}
            </div>
            {list.length > PAGE && (
              <div className="panel-footer">
                <button className="button button-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</button>
                <span>Halaman {page + 1} dari {Math.ceil(list.length / PAGE)}</span>
                <button className="button button-outline" disabled={(page + 1) * PAGE >= list.length} onClick={() => setPage(page + 1)}>Berikutnya</button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
