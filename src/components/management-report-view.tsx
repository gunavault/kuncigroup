"use client";
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { rupiah } from "@/lib/money";
import type { managementReport } from "@/lib/management-report";
import { FinalizationPanel } from "./finalization-panel";
import type { TraceSelection } from "./financial-trace";
import { FinancialRatios } from "./financial-ratios";

type Report = Awaited<ReturnType<typeof managementReport>>;

export function ManagementReportView({ company, periodId, onTrace }: { company: string; periodId: string; onTrace: (selection: TraceSelection) => void }) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setReport(null);
    setError("");
    fetch(`/api/operations?company=${company}&view=management-report${periodId ? `&period=${periodId}` : ""}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Laporan tidak dapat dimuat.");
        if (live) setReport(body);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Koneksi gagal"));
    return () => {
      live = false;
    };
  }, [company, periodId]);
  if (error) return <div className="alert">{error}</div>;
  if (!report)
    return (
      <div className="empty">
        <Loader2 className="spin" size={18} /> Menyusun laporan manajemen…
      </div>
    );
  const p = report.profitLoss;
  const link = (format: string) =>
    `/api/export?report=management&company=${company}&period=${report.period.id}&format=${format}`;
  const kpis: [string, string, string?][] = [
    ["Pendapatan usaha", p.revenue],
    ["Laba kotor", p.grossProfit, p.grossMargin === null ? undefined : `Margin ${p.grossMargin}%`],
    ["Laba (rugi) bersih", p.netProfit, p.netMargin === null ? undefined : `Margin ${p.netMargin}%`],
    ["Kas akhir", report.position.cash],
    ["Piutang usaha", report.position.receivables],
    ["Utang usaha", report.position.payables],
  ];
  return (
    <>
      <div className="report-toolbar">
        <span className={`badge ${report.finalization.state === "FINAL" ? "green" : "amber"}`}>{report.status}</span>
        <span className="badge amber">{report.basis}</span>
        <div className="actions">
          <a className="button button-outline" href={link("xlsx")}>
            <Download size={15} /> Excel
          </a>
          <a className="button button-outline" href={link("pdf")}>
            <Download size={15} /> PDF
          </a>
        </div>
      </div>
      <section className="kpi-grid">
        {kpis.map(([label, value, note]) => (
          <div className="kpi" key={label}>
            <span>{label}</span>
            <h2>{rupiah(value)}</h2>
            {note && <small>{note}</small>}
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Ringkasan eksekutif · {report.period.name}</h2>
            <p>Narasi disusun otomatis dari buku besar yang diposting.</p>
          </div>
        </div>
        <ul className="narrative">
          {report.narrative.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Laba rugi bertingkat</h2>
            <p>Kelompok HPP/beban usaha mengikuti pengelompokan akun kertas kerja.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <tbody>
              {(
                [
                  ["Pendapatan usaha", p.revenue],
                  ["Beban pokok pendapatan (HPP)", p.cogs],
                  ["Laba kotor", p.grossProfit, true],
                  ["Beban usaha", p.opex],
                  ["Laba usaha", p.operatingProfit, true],
                  ["Pendapatan/(beban) lain-lain", p.other],
                  ["Laba sebelum pajak", p.preTax, true],
                  ["Beban pajak penghasilan", p.tax],
                  ["Laba (rugi) bersih", p.netProfit, true],
                ] as [string, string, boolean?][]
              ).map(([k, v, strong], index) => (
                <tr key={k} className={strong ? "total" : undefined}>
                  <td><button className="trace-link" onClick={() => onTrace({ statement: "PROFIT_LOSS", metric: ["PENDAPATAN", "HPP", "grossProfit", "BEBAN", "operatingProfit", "LAIN", "preTax", "PAJAK", "profit"][index], label: k })}>{k}</button></td>
                  <td className="num">{rupiah(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Tren bulanan</h2>
            <p>Tanpa saldo awal dan jurnal penutup.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bulan</th>
                <th className="num">Pendapatan</th>
                <th className="num">HPP</th>
                <th className="num">Beban usaha</th>
                <th className="num">Laba bersih</th>
              </tr>
            </thead>
            <tbody>
              {report.trend.map((t) => (
                <tr key={t.month}>
                  <td>{t.label}</td>
                  <td className="num">{rupiah(t.revenue)}</td>
                  <td className="num">{rupiah(t.cogs)}</td>
                  <td className="num">{rupiah(t.opex)}</td>
                  <td className="num">{rupiah(t.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.trend.length && <div className="empty">Belum ada jurnal pada periode ini.</div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Posisi, arus kas & biaya terbesar</h2>
            <p>
              Aset {rupiah(report.position.assets)} · liabilitas {rupiah(report.position.liabilities)} · ekuitas{" "}
              {rupiah(report.position.equity)} · selisih neraca {rupiah(report.position.balanceDifference)}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <tbody>
              {(
                [
                  ["Kas awal", report.cashFlow.opening],
                  ["Arus kas operasi", report.cashFlow.operating],
                  ["Arus kas investasi", report.cashFlow.investing],
                  ["Arus kas pendanaan", report.cashFlow.financing],
                  ["Kas akhir", report.cashFlow.ending],
                  ["Estimasi di dalam jurnal", report.position.estimates],
                  ...report.position.suspense.map((s) => [`Penampung ${s.code} · ${s.name}`, s.balance]),
                  ...report.topExpenses.map((e) => [`${e.code} · ${e.name} (${e.group})`, e.value]),
                ] as [string, string][]
              ).map(([k, v], index) => (
                <tr key={k}>
                  <td>{index < 5 ? <button className="trace-link" onClick={() => onTrace({ statement: "CASH_FLOW", metric: ["opening", "operating", "investing", "financing", "ending"][index], label: k })}>{k}</button> : k}</td>
                  <td className="num">{rupiah(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <FinancialRatios company={company} period={report.period.id} onTrace={onTrace} />
      <FinalizationPanel company={company} periodId={report.period.id} />
      {report.findings.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Temuan kertas kerja ({report.findings.length})</h2>
              <p>
                Uji kontrol kertas kerja: {report.controls.ok}/{report.controls.total} OK. Temuan wajib ditindaklanjuti
                sebelum laporan final.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Temuan</th>
                  <th className="num">Nilai</th>
                  <th>Tingkat</th>
                  <th>Tindakan</th>
                  <th>PIC</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f) => (
                  <tr key={f.code}>
                    <td>{f.code}</td>
                    <td>{f.issue}</td>
                    <td className="num">{f.amount && !Number.isNaN(Number(f.amount)) ? rupiah(Number(f.amount).toFixed(2)) : "–"}</td>
                    <td>{f.severity}</td>
                    <td>{f.action}</td>
                    <td>{f.owner}</td>
                    <td>{f.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
