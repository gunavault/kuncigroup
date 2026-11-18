"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { UserManagement } from "./user-management";
import { Settings2, MapPin, Users, ShieldCheck, KeyRound } from "lucide-react";
import type { AppState } from "./operation-workspace";
export function SettingsWorkspace({
  state,
  onSubmit,
  onPassword,
}: {
  state: AppState;
  onSubmit: (data: unknown) => Promise<void>;
  onPassword: (data: unknown) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<
      { id: string; code: string; name: string }[]
    >([]),
    [map, setMap] = useState<Record<string, unknown>>(
      (state.company.settings.accounting ?? {}) as Record<string, unknown>,
    ),
    [editBranch, setEditBranch] = useState<string>("");
  useEffect(() => {
    if (state.role === "ADMIN")
      void fetch(`/api/operations?view=accounts&company=${state.company.id}`)
        .then((r) => r.json())
        .then((b) => setAccounts(b.accounts ?? []));
    setMap(
      (state.company.settings.accounting ?? {}) as Record<string, unknown>,
    );
  }, [state.company.id]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operasi gagal");
    } finally {
      setBusy(false);
    }
  }
  const branch = state.branches.find((b) => b.id === editBranch);
  return (
    <div className="settings-stack">
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <UserManagement state={state} onSubmit={onSubmit} />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <KeyRound size={17} /> Kata sandi akun Anda
            </h2>
            <p>Perubahan kata sandi mengakhiri semua sesi akun ini.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("new") !== f.get("confirm")) {
              setError("Konfirmasi kata sandi tidak sama.");
              return;
            }
            void run(() =>
              onPassword({
                currentPassword: f.get("current"),
                newPassword: f.get("new"),
              }),
            );
          }}
        >
          <div className="form-grid">
            <label>
              Kata sandi saat ini
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Kata sandi baru (minimal 16 karakter)
              <input
                name="new"
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={256}
                required
              />
            </label>
            <label>
              Ulangi kata sandi baru
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={256}
                required
              />
            </label>
          </div>
          <div className="panel-footer">
            <Button disabled={busy}>Ganti kata sandi</Button>
          </div>
        </form>
      </section>
      {state.role !== "ADMIN" || !state.permissions.companyWide ? (
        <div className="note">
          <ShieldCheck size={16} /> Pengaturan organisasi dikelola
          administrator perusahaan.
        </div>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  <MapPin size={17} /> Cabang & geofence
                </h2>
                <p>
                  Radius dan koordinat harus sesuai lokasi kerja sebelum
                  validasi absensi dipakai.
                </p>
              </div>
              <select
                value={editBranch}
                onChange={(e) => setEditBranch(e.target.value)}
                aria-label="Edit cabang"
              >
                <option value="">Cabang baru</option>
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <form
              key={editBranch}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() =>
                  onSubmit({
                    action: "branch",
                    companyId: state.company.id,
                    data: {
                      id: editBranch || undefined,
                      code: f.get("code"),
                      name: f.get("name"),
                      address: f.get("address"),
                      latitude: f.get("lat") ? Number(f.get("lat")) : null,
                      longitude: f.get("lon") ? Number(f.get("lon")) : null,
                      radius: Number(f.get("radius")),
                    },
                  }),
                );
              }}
            >
              <div className="form-grid">
                <label>
                  Kode cabang
                  <input
                    name="code"
                    required
                    pattern="[A-Z0-9_-]{1,30}"
                    defaultValue={branch?.code}
                  />
                </label>
                <label>
                  Nama cabang
                  <input
                    name="name"
                    minLength={2}
                    required
                    defaultValue={branch?.name}
                  />
                </label>
                <label className="full-width">
                  Alamat
                  <textarea name="address" defaultValue={branch?.address} />
                </label>
                <label>
                  Latitude
                  <input
                    type="number"
                    step="0.0000001"
                    min="-90"
                    max="90"
                    name="lat"
                    defaultValue={branch?.latitude ?? ""}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="0.0000001"
                    min="-180"
                    max="180"
                    name="lon"
                    defaultValue={branch?.longitude ?? ""}
                  />
                </label>
                <label>
                  Radius (meter)
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    name="radius"
                    required
                    defaultValue={branch?.radius ?? 200}
                  />
                </label>
              </div>
              <div className="panel-footer">
                <Button disabled={busy}>Simpan cabang</Button>
              </div>
            </form>
          </section>
          {state.actor.superuser && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <Settings2 size={17} /> Perusahaan & pemetaan akun
                  </h2>
                  <p>
                    Pemetaan menentukan akun jurnal otomatis. Tinjau bersama
                    Finance sebelum transaksi nyata diposting.
                  </p>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(() =>
                    onSubmit({
                      action: "company",
                      companyId: state.company.id,
                      data: {
                        name: f.get("name"),
                        active: f.get("active") === "on",
                        settings: {
                          ...state.company.settings,
                          accounting: map,
                        },
                      },
                    }),
                  );
                }}
              >
                <div className="form-grid">
                  <label>
                    Nama legal perusahaan
                    <input
                      name="name"
                      required
                      minLength={3}
                      defaultValue={state.company.name}
                    />
                  </label>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={
                        state.companies.find((c) => c.id === state.company.id)
                          ?.active
                      }
                    />
                    Perusahaan aktif
                  </label>
                  {Object.entries({
                    cash: "Kas",
                    bank: "Bank",
                    receivable: "Piutang dagang",
                    payable: "Utang usaha",
                    revenue: "Pendapatan",
                    inventory: "Persediaan",
                    advance: "Kasbon / advance",
                    expense: "Beban operasional",
                    cogs: "Harga pokok penjualan",
                    taxInput: "PPN masukan",
                    taxOutput: "PPN keluaran",
                    withholding: "Pajak dipotong / dibayar di muka",
                    clearing: "Penyeimbang stok (suspense)",
                    capitalId: "Modal / laba ditahan",
                    summaryId: "Ikhtisar laba rugi",
                  }).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <select
                        value={String(map[key] ?? "")}
                        onChange={(e) =>
                          setMap((m) => ({ ...m, [key]: e.target.value }))
                        }
                      >
                        <option value="">Belum dipetakan</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="panel-footer">
                  <Button disabled={busy}>Simpan perusahaan & akun</Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
