"use client";
import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { X, Trash2, Plus, Paperclip, Loader2, Check } from "lucide-react";
import { Button } from "./ui/button";
import { amount, cents, rupiah, validateLines } from "@/lib/money";
import type { State } from "./workspace";
type Values = {
  date: string;
  description: string;
  status: "DRAFT" | "POSTED";
  cashActivity: "OPERATING" | "INVESTING" | "FINANCING";
  lines: {
    accountId: string;
    debit: string;
    credit: string;
    description: string;
  }[];
};
export function JournalForm({
  type,
  data,
  onClose,
  onSave,
}: {
  type: "GENERAL" | "OPENING" | "ADJUSTING";
  data: State;
  onClose: () => void;
  onSave: (v: unknown) => Promise<void>;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    root?.querySelector<HTMLElement>("input,button,select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && root) {
        const nodes = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      date: data.period.startDate.slice(0, 10),
      description: "",
      status: "POSTED",
      cashActivity: "OPERATING",
      lines: [
        { accountId: "111", debit: "0", credit: "0", description: "" },
        { accountId: "411", debit: "0", credit: "0", description: "" },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = watch("lines");
  const [error, setError] = useState(""),
    [attachment, setAttachment] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [uploading, setUploading] = useState(false);
  let debit = 0n,
    credit = 0n,
    valid = false;
  try {
    for (const l of lines) {
      debit += cents(l.debit || "0");
      credit += cents(l.credit || "0");
    }
    validateLines(lines);
    valid = true;
  } catch {}
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("companyId", data.period.companyId);
      form.set("file", file);
      const res = await fetch("/api/files", { method: "POST", body: form });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      setAttachment(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggah gagal.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-title"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PENCATATAN TRANSAKSI</span>
            <h2 id="journal-title">
              {type === "OPENING"
                ? "Saldo awal"
                : type === "ADJUSTING"
                  ? "Penyesuaian"
                  : "Jurnal umum"}{" "}
              baru
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Tutup form"
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit(async (v) => {
            try {
              await onSave({
                ...v,
                periodId: data.period.id,
                type,
                attachmentId: attachment?.id,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Simpan gagal.");
            }
          })}
        >
          <div className="form-grid">
            <label>
              Tanggal transaksi
              <input
                type="date"
                required
                min={data.period.startDate.slice(0, 10)}
                max={data.period.endDate.slice(0, 10)}
                {...register("date", { required: true })}
              />
            </label>
            <label>
              Aktivitas arus kas
              <select {...register("cashActivity")}>
                <option value="OPERATING">Operasional</option>
                <option value="INVESTING">Investasi</option>
                <option value="FINANCING">Pendanaan</option>
              </select>
            </label>
            <label className="full-width">
              Deskripsi
              <input
                placeholder="Contoh: Penerimaan pembayaran pelanggan"
                minLength={3}
                required
                {...register("description", { required: true })}
              />
            </label>
          </div>
          <div className="table-scroll">
            <table className="journal-form-table">
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Debit (IDR)</th>
                  <th>Kredit (IDR)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={f.id}>
                    <td>
                      <select
                        aria-label={`Akun baris ${i + 1}`}
                        {...register(`lines.${i}.accountId`)}
                      >
                        {data.report.rows
                          .filter(
                            (a) => a.active && a.role !== "INCOME_SUMMARY",
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} · {a.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Debit baris ${i + 1}`}
                        inputMode="decimal"
                        {...register(`lines.${i}.debit`)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Kredit baris ${i + 1}`}
                        inputMode="decimal"
                        {...register(`lines.${i}.credit`)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={fields.length <= 2}
                        className="icon-button"
                        aria-label={`Hapus baris ${i + 1}`}
                        onClick={() => remove(i)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-add">
            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= 200}
              onClick={() =>
                append({
                  accountId: data.report.rows[0].id,
                  debit: "0",
                  credit: "0",
                  description: "",
                })
              }
            >
              <Plus size={15} /> Tambah baris
            </Button>
            <label className="upload">
              <Paperclip size={15} />
              {uploading
                ? "Mengunggah…"
                : attachment
                  ? attachment.name
                  : "Lampirkan bukti (maks. 5 MB)"}
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
          </div>
          <div className="balance-check">
            <div>
              <small>Total debit</small>
              <strong>{rupiah(amount(debit))}</strong>
            </div>
            <div>
              <small>Total kredit</small>
              <strong>{rupiah(amount(credit))}</strong>
            </div>
            <div>
              <small>Selisih</small>
              <strong>{rupiah(amount(debit - credit))}</strong>
            </div>
            <span className={`badge ${valid ? "green" : "amber"}`}>
              {valid ? "BALANCE" : "SELISIH / ISI BARIS"}
            </span>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <div className="panel-footer">
            <select aria-label="Status jurnal" {...register("status")}>
              <option value="POSTED">Post jurnal</option>
              <option value="DRAFT">Simpan draft</option>
            </select>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button disabled={!valid || isSubmitting || uploading}>
              {isSubmitting ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}{" "}
              Simpan jurnal
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
