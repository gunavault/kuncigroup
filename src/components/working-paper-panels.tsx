"use client";
import { useState } from "react";
import { rupiah } from "@/lib/money";
import type { workingPaperAnalysis } from "@/lib/working-paper-analysis";

type Analysis = Extract<Awaited<ReturnType<typeof workingPaperAnalysis>>, { available: true }>;
const money = (v: string | null) => (v === null ? "–" : rupiah(v));
const ageLabels: Record<string, string> = { "0_30": "0–30 hari", "31_60": "31–60 hari", "61_90": "61–90 hari", OVER_90: "> 90 hari" };
const Reconcile = ({ items }: { items: [string, string | null][] }) => (
  <div className="kpi-grid service-summary">
    {items.map(([label, value]) => (
      <div className="kpi" key={label}>
        <span>{label}</span>
        <h2>{money(value)}</h2>
      </div>
    ))}
  </div>
);

/** Working-paper evidence for each tab of the service-cycle report (read-only, with sheet/row references). */
export function WorkingPaperPanels({ tab, data }: { tab: string; data: Analysis }) {
  const [showDiff, setShowDiff] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState(""), [siteQuery, setSiteQuery] = useState("");
  if (tab === "aging") {
    const ar = data.receivables, ap = data.payables;
    return (
      <>
        <section className="panel" aria-label="Umur piutang kertas kerja">
          <div className="panel-heading">
            <div>
              <h2>Umur piutang dari register invoice (kertas kerja)</h2>
              <p>{ar.note} Rata-rata jeda penerimaan yang tercatat: {ar.averageCollectionDays ?? "–"} hari. Baris belum lengkap: {ar.incomplete}.</p>
            </div>
          </div>
          <Reconcile items={[["Saldo buku besar " + ar.ledgerAccounts.join(", "), ar.ledger], ["Invoice terbuka (register INV)", ar.total], ["Selisih buku − register", ar.difference]]} />
          <div className="service-filters"><label>Cari invoice sumber<input value={invoiceQuery} onChange={e => setInvoiceQuery(e.target.value)} placeholder="Nomor, pelanggan atau site" /></label></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Umur sejak invoice</th><th className="num">Jumlah invoice</th><th className="num">Saldo</th></tr></thead>
              <tbody>{ar.buckets.map((b) => <tr key={b.bucket}><td>{ageLabels[b.bucket]}</td><td className="num">{b.count}</td><td className="num">{money(b.amount)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Site</th><th className="num">Neto tagihan</th><th className="num">Diterima</th><th className="num">Saldo</th><th className="num">Umur (hari)</th><th>Sumber</th></tr></thead>
              <tbody>
                {ar.open.filter(i => `${i.number} ${i.customer} ${i.site}`.toLocaleLowerCase("id").includes(invoiceQuery.toLocaleLowerCase("id"))).map((i) => (
                  <tr key={i.row}><td>{i.number}</td><td>{i.date}</td><td>{i.customer}</td><td>{i.site}</td><td className="num">{money(i.net)}</td><td className="num">{money(i.received)}</td><td className="num strong">{money(i.outstanding)}</td><td className="num">{i.days}</td><td>INV baris {i.row}</td></tr>
                ))}
              </tbody>
            </table>
            {!ar.open.length && <div className="empty">Tidak ada invoice terbuka per {data.asOf}.</div>}
          </div>
          {ar.settlementDifferences.length > 0 && (
            <p className="note">
              {ar.settlementDifferences.length} invoice memiliki selisih kecil yang tetap masuk saldo terbuka (neto {money(ar.settlementDifferenceTotal)}).{" "}
              <button className="trace-link" onClick={() => setShowDiff(!showDiff)}>{showDiff ? "Sembunyikan" : "Tampilkan rincian"}</button>
            </p>
          )}
          {showDiff && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Invoice</th><th>Tanggal terima</th><th className="num">Neto</th><th className="num">Diterima</th><th className="num">Selisih</th><th>Sumber</th></tr></thead>
                <tbody>{ar.settlementDifferences.map((i) => <tr key={i.row}><td>{i.number}</td><td>{i.receivedOn}</td><td className="num">{money(i.net)}</td><td className="num">{money(i.received)}</td><td className="num">{money(i.outstanding)}</td><td>INV baris {i.row}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel" aria-label="Utang usaha kertas kerja">
          <div className="panel-heading">
            <div>
              <h2>Utang belum dibayar (kertas kerja)</h2>
              <p>{ap.note}</p>
            </div>
          </div>
          <Reconcile items={[["Saldo buku besar utang usaha/operasional", ap.ledger], ["Jumlah menurut OPS_UTANG", ap.summary.find((s) => /jumlah/i.test(s.group))?.total ?? null]]} />
          <div className="table-scroll">
            <table>
              <thead><tr><th>Kelompok</th><th className="num">Pos</th><th className="num">Saldo</th><th className="num">0–30</th><th className="num">31–60</th><th className="num">61–90</th><th className="num">&gt; 90</th></tr></thead>
              <tbody>{ap.summary.map((s) => <tr key={s.row} className={/jumlah/i.test(s.group) ? "total" : undefined}><td>{s.group}</td><td className="num">{s.count}</td><td className="num">{money(s.total)}</td>{s.buckets.map((b, i) => <td className="num" key={i}>{money(b)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="note">{ap.detailNote}</p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Uraian</th><th>Pemasok</th><th>Tanggal</th><th>Akun</th><th>Site</th><th className="num">Saldo</th><th>Sumber</th></tr></thead>
              <tbody>{ap.rows.map((p) => <tr key={p.row}><td>{p.description}</td><td>{p.vendor}</td><td>{p.date}</td><td>{p.account}</td><td>{p.site}</td><td className="num">{money(p.balance)}</td><td>OPS_UTANG baris {p.row}{p.treasuryRow ? ` · TRS baris ${p.treasuryRow}` : ""}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </>
    );
  }
  if (tab === "sites") {
    const s = data.sites;
    return (
      <section className="panel" aria-label="Profitabilitas site kertas kerja">
        <div className="panel-heading">
          <div>
            <h2>Profitabilitas per site menurut kertas kerja</h2>
            <p>{s.note} Selisih terhadap laba/rugi buku besar: {money(s.difference)}.</p>
          </div>
        </div>
        <div className="service-filters"><label>Cari site sumber<input value={siteQuery} onChange={e => setSiteQuery(e.target.value)} /></label></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Site</th><th className="num">Pendapatan</th><th className="num">Beban langsung jasa</th><th className="num">Laba kotor</th><th className="num">Margin kotor</th><th className="num">Beban usaha</th><th className="num">Laba (rugi)</th><th className="num">Baris jurnal</th></tr></thead>
            <tbody>
              {s.rows.filter(x => x.site.toLocaleLowerCase("id").includes(siteQuery.toLocaleLowerCase("id"))).map((x) => (
                <tr key={x.site}><td>{x.site}{x.overhead ? " (biaya bersama)" : ""}</td><td className="num">{money(x.revenue)}</td><td className="num">{money(x.direct)}</td><td className="num">{money(x.grossProfit)}</td><td className="num">{x.grossMargin === null ? "–" : `${x.grossMargin.toLocaleString("id-ID")}%`}</td><td className="num">{money(x.operating)}</td><td className="num strong">{money(x.profit)}</td><td className="num">{x.lines}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Jumlah site</td><td className="num">{money(s.totals.revenue)}</td><td className="num">{money(s.totals.direct)}</td><td /><td /><td className="num">{money(s.totals.operating)}</td><td className="num">{money(s.totals.profit)}</td><td /></tr>
              <tr><td>Buku besar</td><td className="num">{money(s.ledger.revenue)}</td><td className="num">{money(s.ledger.direct)}</td><td /><td /><td className="num">{money(s.ledger.operating)}</td><td className="num">{money(s.ledger.profit)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
        <p className="note">Baris &quot;Tanpa site di kertas kerja&quot; memuat jurnal penyesuaian yang tidak diberi site oleh akuntan, termasuk estimasi beban tenaga kerja (AJP-03). Laba per site menjadi final setelah estimasi diganti payroll aktual per site.</p>
      </section>
    );
  }
  if (tab === "cost")
    return (
      <section className="panel" aria-label="Uji beban tenaga kerja kertas kerja">
        <div className="panel-heading"><div><h2>Uji kewajaran beban tenaga kerja (kertas kerja)</h2><p>{data.laborTest.note}</p></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Uraian</th><th className="num">Nilai</th><th>Dasar</th><th>Sumber</th></tr></thead>
            <tbody>{data.laborTest.rows.map((x) => <tr key={x.row}><td>{x.label}</td><td className="num">{x.ratio ? `${(x.ratioValue * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%` : money(x.value)}</td><td>{x.basis}</td><td>UJI_PAYROLL baris {x.row}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    );
  if (tab === "budget")
    return (
      <section className="panel" aria-label="Anggaran RAB per site">
        <div className="panel-heading"><div><h2>Perbandingan indikatif RAB tender dan biaya site</h2><p>{data.budgets.note}</p></div></div>
        {data.budgets.sites.map((b) => (
          <div key={b.site} className="table-scroll">
            <h3 className="wp-site-title">{b.site} · {b.months} bulan ditagihkan s.d. {data.asOf}</h3>
            <table>
              <thead><tr><th>Kelompok</th><th>Pos RAB</th><th className="num">RAB / bulan</th><th className="num">Anggaran periode</th><th className="num">Realisasi</th><th className="num">Sisa anggaran</th><th className="num">Serapan</th><th>Akun realisasi</th></tr></thead>
              <tbody>{b.rows.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.items.join("; ")}</td><td className="num">{money(r.monthly)}</td><td className="num">{money(r.budget)}</td><td className="num">{money(r.actual)}</td><td className="num strong">{money(r.variance)}</td><td className="num">{r.usage === null ? "–" : `${r.usage.toLocaleString("id-ID")}%`}</td><td>{r.accounts.join(", ")} {r.note}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
        {!data.budgets.sites.length && <div className="empty">Belum ada RAB tender yang diimpor.</div>}
      </section>
    );
  if (tab === "cash")
    return (
      <section className="panel" aria-label="Proyeksi kas kertas kerja">
        <div className="panel-heading"><div><h2>Proyeksi kas dan talangan gaji (kertas kerja)</h2><p>{data.cashProjection.note}</p></div></div>
        {data.cashProjection.openingDifference !== null && data.cashProjection.openingDifference !== "0.00" && (
          <p className="alert" role="note">
            Saldo awal proyeksi kertas kerja {money(data.cashProjection.projectionOpening)} berbeda dengan kas buku besar ERP per {data.asOf} {money(data.cashProjection.ledgerCash)} (selisih {money(data.cashProjection.openingDifference)}, antara lain jurnal koreksi setelah kertas kerja). Saldo kas buku juga belum direkonsiliasi penuh ke rekening koran (Accounting → Rekonsiliasi bank); perbarui proyeksi setelah rekonsiliasi.
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Uraian</th>{data.cashProjection.months.map((m, i) => <th className="num" key={m}>{m} ({"BCD"[i]})</th>)}<th className="num">Kolom E</th><th>Dasar</th><th>Sumber</th></tr></thead>
            <tbody>{data.cashProjection.rows.map((x) => <tr key={x.row} className={/^(saldo|arus kas neto|skenario)/i.test(x.label) ? "total" : undefined}><td>{x.label}</td>{x.values.map((v, i) => <td className="num" key={i}>{money(v)}</td>)}<td className="num">{money(x.total)}</td><td>{x.basis}</td><td>PROYEKSI_KAS baris {x.row}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="note">Kolom B–D umumnya bulan pertama s.d. ketiga setelah tanggal buku besar dan kolom E jumlahnya; bila kolom dasar menyatakan lain (mis. baris saldo), ikuti keterangan pada kolom dasar.</p>
      </section>
    );
  return null;
}
