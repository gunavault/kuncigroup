"use client";
import { useEffect, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import type { finalizationStatus, finalizationPermissions } from "@/lib/finalization";

type Status = Awaited<ReturnType<typeof finalizationStatus>> & { permissions: ReturnType<typeof finalizationPermissions> };
const labels: Record<string, string> = {
  OPEN: "Terbuka",
  IN_PROGRESS: "Dalam proses",
  RESOLVED: "Selesai",
  ACCEPTED_RISK: "Risiko diterima",
};
const stateLabel: Record<string, string> = {
  DRAFT: "DRAFT · belum final",
  FINAL: "FINAL",
  FINAL_WITH_EXCEPTIONS: "FINAL dengan pengecualian",
};

export function FinalizationPanel({ company, periodId, onChange }: { company: string; periodId: string; onChange?: () => void }) {
  const [s, setS] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<{ code: string; status: string; note: string; evidence: string } | null>(null),
    [note, setNote] = useState("");
  const load = () =>
    fetch(`/api/operations?company=${company}&view=finalization&period=${periodId}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Gagal memuat finalisasi");
        setS(b);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Koneksi gagal"));
  useEffect(() => {
    if (periodId) void load();
  }, [company, periodId]);
  async function act(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalization", companyId: company, data: { periodId, ...data } }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Gagal menyimpan");
      setS(b.result);
      setEdit(null);
      setNote("");
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }
  if (!s) return error ? <div className="alert">{error}</div> : <div className="empty"><Loader2 className="spin" size={16} /> Memuat finalisasi…</div>;
  if (!s.applies) return null;
  const locked = s.period.status === "CLOSED";
  const permission = s.permissions;
  return (
    <section className="panel" aria-label="Finalisasi laporan">
      <div className="panel-heading">
        <div>
          <h2>
            Finalisasi laporan · <span className={`badge ${s.state === "DRAFT" ? "amber" : "green"}`}>{stateLabel[s.state]}</span>
          </h2>
          <p>
            Laporan menjadi FINAL hanya bila seluruh syarat terbukti dari data dan disetujui dua orang berbeda (Finance, lalu
            Direksi). Tutup buku periode ini ditolak sampai syarat terpenuhi atau pengecualian Direksi dicatat.
          </p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <ul className="checklist">
        {s.checks.map((c) => (
          <li key={c.key} className={c.ok ? "ok" : "todo"}>
            {c.ok ? <Check size={15} /> : <X size={15} />} <strong>{c.label}</strong> <span>{c.detail}</span>
          </li>
        ))}
      </ul>
      {s.staleSignoffs > 0 && <p className="note">Buku besar atau klasifikasi akun berubah. {s.staleSignoffs} sign-off lama tidak lagi berlaku; lakukan tinjauan dan sign-off ulang.</p>}
      {s.decision && <p className="note">Catatan pengembalian oleh {s.decision.name}: {s.decision.reason}</p>}
      {s.signoffs.map(sign => <p key={sign.role} className="note">{sign.role === "FINANCE" ? "Sign-off Finance" : "Persetujuan Direksi"}: {sign.name} · {sign.at.slice(0, 10)} · {sign.note}{!locked && (permission.admin || permission.actorId === sign.by) && <button className="trace-link" disabled={busy} onClick={() => void act({ action: "withdrawSignoff", role: sign.role, note })}>Tarik sign-off (isi alasan)</button>}</p>)}
      {s.exception && (
        <p className="muted">
          Pengecualian Direksi oleh {s.exception.name} ({s.exception.at.slice(0, 10)}): {s.exception.reason}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Temuan</th>
              <th>Tingkat</th>
              <th>Status</th>
              <th>Penyelesaian</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.findings.map((f) => (
              <tr key={f.code}>
                <td>{f.code}</td>
                <td>{f.issue}</td>
                <td>{f.severity}</td>
                <td>{labels[f.status]}</td>
                <td>
                  {f.resolution
                    ? `${f.resolution.note}${f.resolution.evidence ? ` · Bukti: ${f.resolution.evidence}` : ""} — ${f.resolution.name}, ${f.resolution.at.slice(0, 10)}`
                    : `PIC ${f.owner} · target ${f.due}`}
                </td>
                <td>
                  {!locked && (permission.finance || permission.director) && (
                    <button
                      className="text-link"
                      onClick={() => setEdit({ code: f.code, status: !permission.finance ? "ACCEPTED_RISK" : f.status === "OPEN" ? "IN_PROGRESS" : f.status, note: f.resolution?.note ?? "", evidence: f.resolution?.evidence ?? "" })}
                    >
                      Perbarui
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "finding", ...edit });
          }}
        >
          <label>
            Status {edit.code}
            <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {Object.entries(labels).map(([k, v]) => (
                <option key={k} value={k} disabled={k === "ACCEPTED_RISK" ? !permission.director : !permission.finance}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Catatan penyelesaian
            <textarea value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} minLength={20} />
          </label>
          <label>
            Rujukan bukti (nomor dokumen, jurnal koreksi, atau lokasi arsip)
            <input value={edit.evidence} onChange={(e) => setEdit({ ...edit, evidence: e.target.value })} />
          </label>
          <div className="panel-footer">
            <button className="button button-outline" type="button" onClick={() => setEdit(null)}>
              Batal
            </button>
            <button className="button" disabled={busy}>
              Simpan
            </button>
          </div>
        </form>
      )}
      {!locked && (permission.finance || permission.director) && (
        <div className="form-grid">
          <label>
            Catatan sign-off / alasan pengecualian
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="panel-footer">
            <button className="button button-outline" disabled={busy || !permission.finance || !s.readyForSignOff || s.signoffs.some(x => x.role === "FINANCE" || x.by === permission.actorId)} onClick={() => void act({ action: "signoff", role: "FINANCE", note })}>
              Sign-off Finance
            </button>
            <button className="button button-outline" disabled={busy || !permission.director || !s.readyForSignOff || !s.signoffs.some(x => x.role === "FINANCE" && x.by !== permission.actorId) || s.signoffs.some(x => x.role === "DIRECTOR")} onClick={() => void act({ action: "signoff", role: "DIRECTOR", note })}>
              Persetujuan Direksi
            </button>
            <button className="button button-outline" disabled={busy || !permission.director} onClick={() => void act({ action: "exception", note })}>
              Catat pengecualian Direksi
            </button>
            <button className="button button-outline" disabled={busy || !permission.director || !s.signoffs.some(x => x.role === "FINANCE" && x.by !== permission.actorId)} onClick={() => void act({ action: "reject", note })}>Tolak / kembalikan laporan</button>
            {s.exception && <button className="button button-outline" disabled={busy || !permission.director} onClick={() => void act({ action: "revokeException", note })}>Cabut pengecualian</button>}
          </div>
        </div>
      )}
    </section>
  );
}
