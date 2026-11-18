"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function PasswordGate({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        className="panel login-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("new") !== f.get("confirm")) {
            setError("Konfirmasi tidak sama.");
            return;
          }
          setBusy(true);
          try {
            const r = await fetch("/api/operations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "password",
                data: {
                  currentPassword: f.get("current"),
                  newPassword: f.get("new"),
                },
              }),
            });
            const b = await r.json();
            if (!r.ok) throw new Error(b.error);
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Perubahan gagal");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand-mark">K</div>
        <h2>Ganti kata sandi awal</h2>
        <p>
          Data perusahaan dapat diakses setelah kata sandi awal diganti. Setelah
          selesai, masuk kembali.
        </p>
        <label>
          Kata sandi awal
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Kata sandi baru
          <input
            name="new"
            type="password"
            required
            minLength={16}
            maxLength={256}
            autoComplete="new-password"
          />
        </label>
        <label>
          Ulangi kata sandi baru
          <input
            name="confirm"
            type="password"
            required
            minLength={16}
            maxLength={256}
            autoComplete="new-password"
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <Button disabled={busy}>Simpan & masuk kembali</Button>
      </form>
    </main>
  );
}
