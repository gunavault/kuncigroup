"use client";
import type { ServicePlanState } from "@/lib/service-plans-ui";
import type { serviceReport } from "@/lib/service-report";
import type { TraceSelection } from "./financial-trace";
import { rupiah } from "@/lib/money";
type Report = Awaited<ReturnType<typeof serviceReport>>;
export function SiteAllocationEditor({ plan, report, disabled, onChange, onSave, onTrace }: { plan: ServicePlanState; report: Report; disabled: boolean; onChange: (p: ServicePlanState) => void; onSave: () => void; onTrace: (p: TraceSelection) => void }) {
  return <section className="panel"><div className="panel-heading"><div><h2>Alokasi analitis ke site</h2><p>Alokasi membagi baris pendapatan/beban ke proyek dengan bukti. Jurnal terposting tetap utuh. Nilai yang belum dibagi tetap mengikuti sumber proyek eksplisit atau pos belum dialokasikan.</p></div></div>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); onSave(); }}><fieldset className="full-width" disabled={disabled}><legend>Alokasi baris buku besar</legend>
      {plan.allocations.map((a, i) => { const selected = report.allocatableLines.find(l => l.id === a.lineId); const change = (patch: Partial<typeof a>) => onChange({ ...plan, allocations: plan.allocations.map((v, j) => i === j ? { ...v, ...patch } : v) });
        return <div className="service-plan-row" key={i}><label>Baris jurnal<select required value={a.lineId} onChange={e => change({ lineId: e.target.value })}><option value="">Pilih baris jurnal</option>{report.allocatableLines.map(l => <option key={l.id} value={l.id}>{l.journal} · {l.account} · {rupiah(l.value)}</option>)}</select></label>
          <label>Proyek / site<select required value={a.projectId} onChange={e => change({ projectId: e.target.value })}><option value="">Pilih proyek</option>{report.projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
          <label>Nilai yang dialokasikan (IDR)<input required inputMode="decimal" value={a.amount} onChange={e => change({ amount: e.target.value })} /></label><label>Rujukan bukti alokasi<input required minLength={20} maxLength={1000} value={a.evidence} onChange={e => change({ evidence: e.target.value })} /></label>
          <div className="actions">{selected && <button type="button" className="trace-link" onClick={() => onTrace({ statement: "JOURNAL", journal: selected.journalId, label: selected.journal })}>Telusuri jurnal</button>}<button type="button" className="button button-outline" onClick={() => onChange({ ...plan, allocations: plan.allocations.filter((_, j) => i !== j) })}>Hapus alokasi</button></div>
        </div>;
      })}
      <button type="button" className="button button-outline" disabled={plan.allocations.length >= 1000} onClick={() => onChange({ ...plan, allocations: [...plan.allocations, { lineId: "", projectId: "", amount: "", evidence: "" }] })}>Tambah alokasi analitis</button>
    </fieldset><button className="button" disabled={disabled}>Simpan draft alokasi</button></form>
  </section>;
}
