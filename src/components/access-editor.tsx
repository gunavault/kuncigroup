"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { AppState } from "./operation-workspace";
export function AccessEditor({
  state,
  onSubmit,
}: {
  state: AppState;
  onSubmit: (data: unknown) => Promise<void>;
}) {
  const [userId, setUserId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const grant = state.users
    .find((u) => u.id === userId)
    ?.grants.find((g) => g.companyId === state.company.id);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Hak akses perusahaan</h2>
          <p>
            Perubahan peran atau cakupan cabang mengakhiri sesi pengguna
            terkait.
          </p>
        </div>
      </div>
      <form
        key={userId + "-" + state.company.id}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError("");
          setBusy(true);
          try {
            await onSubmit({
              action: "grant",
              companyId: state.company.id,
              data: {
                userId,
                role: f.get("role"),
                branchIds: f.getAll("branches"),
              },
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Perubahan akses gagal.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Pengguna
            <select
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Pilih pengguna</option>
              {state.users.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.name} · {u.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Peran
            <select name="role" defaultValue={grant?.role ?? "STAFF"}>
              {[
                "STAFF",
                "SUPERVISOR",
                "MANAGER",
                "FINANCE",
                "HR",
                "AUDITOR",
                "ADMIN",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="full-width branch-checkboxes">
            <span>Cakupan cabang (kosong = seluruh perusahaan)</span>
            {state.branches.map((b) => (
              <label className="inline-check" key={b.id}>
                <input
                  type="checkbox"
                  name="branches"
                  value={b.id}
                  defaultChecked={grant?.branchIds.includes(b.id)}
                />
                {b.name}
              </label>
            ))}
          </div>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="panel-footer">
          <Button disabled={!userId || busy}>Simpan hak akses</Button>
        </div>
      </form>
    </section>
  );
}
