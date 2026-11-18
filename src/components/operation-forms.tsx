"use client";
import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, Paperclip, Loader2, Save } from "lucide-react";
import { Button } from "./ui/button";
import {
  definitions,
  masterDefinitions,
  type Field,
} from "@/lib/operations/registry";
export type Master = {
  id: string;
  companyId: string;
  branchId: string | null;
  kind: string;
  code: string;
  name: string;
  active: boolean;
  data: Record<string, unknown>;
  sourceFileId?: string | null;
};
export type RecordData = {
  id: string;
  companyId: string;
  branchId: string | null;
  module: string;
  number: string;
  title: string;
  date: string;
  status: string;
  version: number;
  amount: string;
  settled: string;
  data: Record<string, unknown>;
  actorId: string;
  approvedBy?: string | null;
  sourceFileId?: string | null;
  sourceRow?: string | null;
  lines: {
    id?: string;
    productId: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
    data: Record<string, unknown>;
  }[];
};
export type Branch = {
  id: string;
  code: string;
  name: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  radius: number;
};
export function Fields({
  fields,
  values,
  onChange,
  masters,
  companyId,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  masters: Master[];
  companyId: string;
}) {
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      {fields.map((f) => (
        <label
          key={f.key}
          className={f.type === "textarea" ? "full-width" : ""}
        >
          {f.label}
          {f.required ? " *" : ""}
          {f.key === "ingredients" ? (
            <IngredientsEditor
              value={String(values[f.key] ?? "")}
              masters={masters}
              onChange={(v) => onChange(f.key, v)}
            />
          ) : f.key === "attachmentId" ? (
            <>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setError("");
                  try {
                    const form = new FormData();
                    form.set("companyId", companyId);
                    form.set("file", file);
                    const r = await fetch("/api/files", {
                      method: "POST",
                      body: form,
                    });
                    const b = await r.json();
                    if (!r.ok) throw new Error(b.error);
                    onChange(f.key, b.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Unggah gagal");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <small>
                {uploading
                  ? "Mengunggah…"
                  : values[f.key]
                    ? "Bukti tersimpan: " + String(values[f.key])
                    : "PDF, JPEG, PNG · maks. 5 MB"}
              </small>
              {error && <span className="text-error">{error}</span>}
            </>
          ) : f.master ? (
            <select
              required={f.required}
              value={String(values[f.key] ?? "")}
              onChange={(e) => onChange(f.key, e.target.value)}
            >
              <option value="">Pilih {f.label.toLowerCase()}</option>
              {masters
                .filter((m) => m.kind === f.master && m.active)
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.code} · {m.name}
                  </option>
                ))}
            </select>
          ) : f.type === "select" ? (
            <select
              required={f.required}
              value={String(values[f.key] ?? "")}
              onChange={(e) => onChange(f.key, e.target.value)}
            >
              <option value="">Pilih…</option>
              {f.options?.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              required={f.required}
              rows={3}
              value={String(values[f.key] ?? "")}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : f.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={Boolean(values[f.key])}
              onChange={(e) => onChange(f.key, e.target.checked)}
            />
          ) : (
            <input
              required={f.required}
              type={f.type ?? "text"}
              step={f.type === "number" ? "any" : undefined}
              value={
                f.type === "datetime-local" &&
                String(values[f.key] ?? "").endsWith("Z")
                  ? new Date(
                      new Date(String(values[f.key])).getTime() + 7 * 3600000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : String(values[f.key] ?? "")
              }
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}{" "}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),a[href]",
          ) ?? [],
        );
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal ops-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">KUNCI GROUP · WORKSPACE</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
const today = () =>
  new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export function RecordEditor({
  module,
  record,
  companyId,
  branchId,
  branches,
  masters,
  onClose,
  onSubmit,
  initialData,
}: {
  module: string;
  record?: RecordData | null;
  companyId: string;
  branchId?: string;
  branches: Branch[];
  masters: Master[];
  onClose: () => void;
  onSubmit: (data: unknown) => Promise<void>;
  initialData?: Record<string, unknown>;
}) {
  const def = definitions.find((m) => m.key === module)!;
  const [title, setTitle] = useState(record?.title ?? ""),
    [date, setDate] = useState(record?.date.slice(0, 10) ?? today()),
    [branch, setBranch] = useState(record?.branchId ?? branchId ?? ""),
    [data, setData] = useState<Record<string, unknown>>({
      ...initialData,
      ...record?.data,
    }),
    [lines, setLines] = useState(
      record?.lines.map((l) => ({ ...l, productId: l.productId ?? "" })) ?? [
        {
          productId: "",
          description: "",
          quantity: "1",
          unitPrice: "0",
          total: "0",
          data: {},
        },
      ],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const field = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const subtotal = lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0,
  );
  const updateLine = (i: number, key: string, value: unknown) =>
    setLines((ls) => ls.map((l, j) => (i === j ? { ...l, [key]: value } : l)));
  return (
    <Modal
      title={`${record ? "Edit" : "Buat"} · ${def.name}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSubmit({
              id: record?.id,
              version: record?.version,
              companyId,
              branchId: branch || null,
              module,
              title,
              date,
              data,
              lines: def.lines
                ? lines.map((l) => ({
                    ...l,
                    productId: l.productId || undefined,
                  }))
                : [],
            });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Simpan gagal");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Judul / uraian *
            <input
              minLength={3}
              maxLength={250}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Tanggal transaksi *
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Cabang / lokasi
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Perusahaan / kantor pusat</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <Fields
            fields={def.fields}
            values={data}
            onChange={field}
            masters={masters}
            companyId={companyId}
          />
          {module === "attendances" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!navigator.geolocation) {
                  setError("GPS tidak didukung browser.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setData((d) => ({
                      ...d,
                      latitude: String(p.coords.latitude),
                      longitude: String(p.coords.longitude),
                      accuracy: String(Math.ceil(p.coords.accuracy)),
                      checkIn: new Date(Date.now() + 7 * 3600000)
                        .toISOString()
                        .slice(0, 16),
                    }));
                  },
                  (e) => setError(e.message),
                  { enableHighAccuracy: true, timeout: 20000 },
                );
              }}
            >
              Ambil lokasi GPS saat ini
            </Button>
          )}
          {record?.status === "IMPORTED" && (
            <label className="full-width">
              Catatan verifikasi sumber *
              <textarea
                required
                minLength={10}
                value={String(data.reviewNote ?? "")}
                onChange={(e) => field("reviewNote", e.target.value)}
                placeholder="Jelaskan hasil pemeriksaan tanggal, jumlah, pihak, dan referensi sumber."
              />
            </label>
          )}
        </div>
        {def.lines && (
          <>
            <div className="table-scroll">
              <table className="ops-line-table">
                <thead>
                  <tr>
                    <th>Barang / jasa</th>
                    <th>Uraian</th>
                    <th>Kuantitas</th>
                    <th>Harga satuan</th>
                    <th>Lot / kedaluwarsa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          aria-label={`Produk ${i + 1}`}
                          value={l.productId ?? ""}
                          onChange={(e) => {
                            const p = masters.find(
                              (m) => m.id === e.target.value,
                            );
                            setLines((ls) =>
                              ls.map((line, j) =>
                                j === i
                                  ? {
                                      ...line,
                                      productId: e.target.value,
                                      description: p?.name ?? line.description,
                                      unitPrice: String(
                                        p?.data[
                                          module === "purchase" ||
                                          module === "inventory"
                                            ? "cost"
                                            : "salePrice"
                                        ] ?? "0",
                                      ),
                                    }
                                  : line,
                              ),
                            );
                          }}
                        >
                          <option value="">Uraian tanpa produk</option>
                          {masters
                            .filter((m) => m.kind === "PRODUCT" && m.active)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.code} · {m.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          required
                          aria-label={`Uraian ${i + 1}`}
                          value={l.description}
                          onChange={(e) =>
                            updateLine(i, "description", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          required
                          min="0.001"
                          step="0.001"
                          aria-label={`Kuantitas ${i + 1}`}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(i, "quantity", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          aria-label={`Harga ${i + 1}`}
                          value={l.unitPrice}
                          onChange={(e) =>
                            updateLine(i, "unitPrice", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          placeholder="Nomor lot"
                          aria-label={`Lot ${i + 1}`}
                          value={String(l.data.lotCode ?? "")}
                          onChange={(e) =>
                            updateLine(i, "data", {
                              ...l.data,
                              lotCode: e.target.value,
                            })
                          }
                        />
                        <input
                          type="date"
                          aria-label={`Kedaluwarsa ${i + 1}`}
                          value={String(l.data.expiresAt ?? "")}
                          onChange={(e) =>
                            updateLine(i, "data", {
                              ...l.data,
                              expiresAt: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines((ls) => ls.filter((_, j) => j !== i))
                          }
                          aria-label={`Hapus baris ${i + 1}`}
                        >
                          <Trash2 size={15} />
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
                disabled={lines.length >= 100}
                onClick={() =>
                  setLines((ls) => [
                    ...ls,
                    {
                      productId: "",
                      description: "",
                      quantity: "1",
                      unitPrice: "0",
                      total: "0",
                      data: {},
                    },
                  ])
                }
              >
                <Plus size={15} /> Tambah baris
              </Button>
              <span>
                Subtotal indikatif:{" "}
                <strong>
                  {subtotal.toLocaleString("id-ID", {
                    style: "currency",
                    currency: "IDR",
                  })}
                </strong>
              </span>
            </div>
          </>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="panel-footer">
          <span className="muted">
            Draft → diajukan → disetujui → diposting
          </span>
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}{" "}
            Simpan draft
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function MasterEditor({
  kind,
  record,
  companyId,
  branches,
  masters,
  onClose,
  onSubmit,
}: {
  kind: string;
  record?: Master | null;
  companyId: string;
  branches: Branch[];
  masters: Master[];
  onClose: () => void;
  onSubmit: (d: unknown) => Promise<void>;
}) {
  const [code, setCode] = useState(record?.code ?? ""),
    [name, setName] = useState(record?.name ?? ""),
    [branch, setBranch] = useState(record?.branchId ?? ""),
    [data, setData] = useState<Record<string, unknown>>(record?.data ?? {}),
    [active, setActive] = useState(record?.active ?? true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`${record ? "Edit" : "Tambah"} · ${masterDefinitions[kind].label}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSubmit({
              id: record?.id,
              companyId,
              kind,
              code,
              name,
              branchId: branch || null,
              active,
              data,
            });
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Simpan gagal");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Kode *
            <input
              required
              maxLength={60}
              pattern="[A-Za-z0-9._/\-]+"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            Nama *
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Cabang
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Master bersama perusahaan</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{" "}
            Aktif
          </label>
          <Fields
            fields={masterDefinitions[kind].fields}
            values={data}
            onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))}
            masters={masters}
            companyId={companyId}
          />
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="panel-footer">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={busy}>Simpan master</Button>
        </div>
      </form>
    </Modal>
  );
}

function IngredientsEditor({
  value,
  masters,
  onChange,
}: {
  value: string;
  masters: Master[];
  onChange: (v: string) => void;
}) {
  const rows = value
    ? value.split(/\r?\n/).map((v) => {
        const [id, n = "1"] = v.split("=");
        return { id: id.trim(), n: n.trim() };
      })
    : [{ id: "", n: "1" }];
  const update = (i: number, k: "id" | "n", v: string) =>
    onChange(
      rows
        .map((r, j) => (j === i ? { ...r, [k]: v } : r))
        .map((r) => r.id + "=" + r.n)
        .join("\n"),
    );
  return (
    <span className="ingredients-editor">
      {rows.map((r, i) => (
        <span className="ingredient-row" key={i}>
          <select
            aria-label={"Bahan " + (i + 1)}
            value={r.id}
            onChange={(e) => update(i, "id", e.target.value)}
            required
          >
            <option value="">Pilih bahan baku</option>
            {masters
              .filter((m) => m.kind === "PRODUCT" && m.data.type === "STOCK")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {String(m.data.uom ?? "")}
                </option>
              ))}
          </select>
          <input
            aria-label={"Kuantitas bahan " + (i + 1)}
            type="number"
            step="0.001"
            min="0.001"
            required
            value={r.n}
            onChange={(e) => update(i, "n", e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            disabled={rows.length === 1}
            onClick={() =>
              onChange(
                rows
                  .filter((_, j) => j !== i)
                  .map((r) => r.id + "=" + r.n)
                  .join("\n"),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange((value ? value + "\n" : "") + "=1")}
      >
        <Plus size={14} /> Tambah bahan
      </Button>
    </span>
  );
}
