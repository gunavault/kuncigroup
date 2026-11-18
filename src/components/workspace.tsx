"use client";
import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  FileText,
  Wallet,
  Building2,
  ChevronDown,
  Check,
  ArrowRight,
  Download,
  Search,
  SlidersHorizontal,
  LockKeyhole,
  Paperclip,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Loader2,
  LogOut,
  Menu,
  Layers3,
  Scale,
  ChartNoAxesCombined,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { rupiah, amount, cents } from "@/lib/money";
import { JournalForm } from "./journal-form";
import type { snapshot } from "@/lib/accounting";
type Data = Awaited<ReturnType<typeof snapshot>>;
type Wire<T> = T extends Date
  ? string
  : T extends { toFixed: (...args: never[]) => unknown }
    ? string
    : T extends Array<infer U>
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;
export type State = Wire<Data>;
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Master data & saldo awal", Layers3],
  ["Jurnal umum", BookOpen],
  ["Buku besar", FileText],
  ["Neraca saldo", Scale],
  ["Penyesuaian", SlidersHorizontal],
  ["Laporan keuangan", ChartNoAxesCombined],
  ["Tutup buku", LockKeyhole],
] as const;
const date = (v: string) =>
  new Date(v).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const typeNames: Record<string, string> = {
  GENERAL: "Jurnal umum",
  OPENING: "Saldo awal",
  ADJUSTING: "Penyesuaian",
  CLOSING: "Penutup",
  REVERSING: "Pembalik",
};
export default function Workspace() {
  const [email, setEmail] = useState("admin@kuncigroup.cloud");
  const [data, setData] = useState<State | null>(null),
    [page, setPage] = useState(0),
    [periodId, setPeriodId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [needLogin, setNeedLogin] = useState(false),
    [password, setPassword] = useState(""),
    [query, setQuery] = useState(""),
    [journalType, setJournalType] = useState<
      "GENERAL" | "OPENING" | "ADJUSTING" | null
    >(null),
    [accountId, setAccountId] = useState("111"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [plan, setPlan] = useState<
      | {
          description: string;
          lines: { accountId: string; debit: string; credit: string }[];
        }[]
      | null
    >(null),
    [mobile, setMobile] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  async function load(pid = periodId) {
    setError("");
    try {
      const res = await fetch(
        `/api/erp?company=${new URL(window.location.href).searchParams.get("company") ?? "DEMO"}${pid ? `&period=${pid}` : ""}`,
      );
      const body = await res.json();
      if (res.status === 428) {
        location.assign("/");
        return;
      }
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) throw new Error(body.error);
      setData(body);
      setPeriodId(body.period.id);
      setNeedLogin(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi gagal");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      return b.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operasi gagal");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function mutate(body: unknown, message: string) {
    try {
      await act(body);
      setNotice(message);
      setPlan(null);
      await load();
      return true;
    } catch {
      return false;
    }
  }
  const r = data?.report;
  const rows = r?.rows ?? [];
  const journals = data?.journals ?? [];
  const filtered = journals.filter((e) =>
    `${e.journalNumber} ${e.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const open = data?.period.status === "OPEN";
  async function login(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const b = await res.json();
    if (!res.ok) setError(b.error);
    else {
      setPassword("");
      await load();
    }
  }
  if (needLogin)
    return (
      <main className="login">
        <form onSubmit={login} className="panel login-panel">
          <div className="brand-mark">K</div>
          <h1>Kunci Group</h1>
          <p>Masuk ke workspace keuangan.</p>
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Kata sandi
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <Button>
            Masuk <ArrowRight size={16} />
          </Button>
        </form>
      </main>
    );
  const exportLink = (format: string) =>
    `/api/export?period=${periodId}&format=${format}`;
  const journalTable = (list = filtered) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Nomor & transaksi</th>
            <th>Tanggal</th>
            <th>Jenis jurnal</th>
            <th className="num">Nilai debit</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.id}>
              <td>
                <strong>{e.journalNumber}</strong>
                <span className="cell-sub">{e.description}</span>
              </td>
              <td>{date(String(e.transactionDate))}</td>
              <td>{typeNames[e.type]}</td>
              <td className="num strong">
                {rupiah(
                  amount(
                    e.lines.reduce((s, l) => s + cents(String(l.debit)), 0n),
                  ),
                )}
              </td>
              <td>
                <span
                  className={`badge ${e.status === "POSTED" ? "green" : "amber"}`}
                >
                  <span className="dot" />
                  {e.status === "POSTED" ? "Posted" : "Draft"}
                </span>
              </td>
              <td>
                <div className="actions">
                  {e.attachmentId && (
                    <a
                      className="icon-button"
                      aria-label="Unduh bukti"
                      href={`/api/files?id=${e.attachmentId}`}
                    >
                      <Paperclip size={15} />
                    </a>
                  )}
                  {e.status === "DRAFT" && open && (
                    <button
                      title="Post jurnal"
                      className="icon-button"
                      onClick={() =>
                        void mutate(
                          { action: "post", id: e.id },
                          "Draft berhasil diposting.",
                        )
                      }
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {e.status === "POSTED" &&
                    ["GENERAL", "ADJUSTING"].includes(e.type) &&
                    !journals.some((j) => j.reversalOfId === e.id) && (
                      <button
                        title="Buat jurnal pembalik"
                        className="icon-button"
                        onClick={() => {
                          if (
                            confirm(
                              `Buat jurnal pembalik ${e.journalNumber} pada periode terbuka?`,
                            )
                          ) {
                            const target = data?.periods.find(
                              (p) => p.status === "OPEN",
                            );
                            if (target)
                              void mutate(
                                {
                                  action: "reverse",
                                  id: e.id,
                                  periodId: target.id,
                                  date: target.startDate.slice(0, 10),
                                },
                                "Jurnal pembalik berhasil dibuat.",
                              );
                            else setError("Tidak ada periode terbuka.");
                          }
                        }}
                      >
                        <RotateCcw size={15} />
                      </button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && (
        <div className="empty">Belum ada jurnal yang sesuai.</div>
      )}
    </div>
  );
  let running = 0n;
  const ledger =
    journals
      .filter((e) => e.status === "POSTED")
      .toSorted(
        (a, b) =>
          a.transactionDate.localeCompare(b.transactionDate) ||
          a.journalNumber.localeCompare(b.journalNumber),
      )
      .flatMap((e) =>
        e.lines
          .filter((l) => l.accountId === accountId)
          .map((l) => ({ entry: e, line: l })),
      ) ?? [];
  const normal = rows.find((a) => a.id === accountId)?.normalBalance;
  const ledgerRows = ledger
    .map((v) => {
      running +=
        (cents(String(v.line.debit)) - cents(String(v.line.credit))) *
        (normal === "KREDIT" ? -1n : 1n);
      return { ...v, balance: amount(running) };
    })
    .filter(
      (v) =>
        (!from || v.entry.transactionDate.slice(0, 10) >= from) &&
        (!to || v.entry.transactionDate.slice(0, 10) <= to),
    );
  const chart = [
    "01",
    "03",
    "05",
    "08",
    "12",
    "16",
    "20",
    "24",
    "28",
    "31",
  ].map((d) => {
    let revenue = 0n,
      expense = 0n;
    for (const e of r?.entries ?? [])
      if (e.transactionDate.slice(8, 10) <= d)
        for (const l of e.lines) {
          if (l.account.category === "PENDAPATAN")
            revenue += cents(String(l.credit)) - cents(String(l.debit));
          if (l.account.category === "BEBAN")
            expense += cents(String(l.debit)) - cents(String(l.credit));
        }
    return {
      day: d,
      pendapatan: Number(amount(revenue)),
      beban: Number(amount(expense)),
    };
  });
  return (
    <div className="workspace">
      <aside className={mobile ? "sidebar show" : "sidebar"}>
        <a href="#" className="brand" onClick={() => setPage(0)}>
          <div className="brand-mark">
            K<span />
          </div>
          <div>
            KUNCI GROUP<small>FINANCE WORKSPACE</small>
          </div>
        </a>
        <div className="company">
          <div className="company-icon">
            <Building2 size={19} />
          </div>
          <div>
            <strong>{data?.company.name ?? "Kunci Group"}</strong>
            <small>
              {data?.company.isDemo
                ? "Workspace simulasi"
                : "Pembukuan perusahaan"}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon], i) => (
            <button
              key={label}
              className={page === i ? "nav-item active" : "nav-item"}
              onClick={() => {
                setPage(i);
                setQuery("");
                setMobile(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {i > 0 && <small>{String(i).padStart(2, "0")}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CheckCircle2 size={17} />
            </div>
            <strong>Pembukuan yang terjaga</strong>
            <p>Jurnal seimbang. Jejak audit tersimpan. Periode terlindungi.</p>
            <span>
              <span className="dot" /> Double-entry accounting
            </span>
          </div>
          <button
            className="profile"
            onClick={async () => {
              await fetch("/api/session", { method: "DELETE" });
              await load();
            }}
          >
            <div className="avatar">KG</div>
            <div>
              <strong>Finance Kunci Group</strong>
              <small>Sesi terautentikasi</small>
            </div>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              onClick={() => setMobile(!mobile)}
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>
            <a href="/">Semua aplikasi</a>
            <span>/</span>
            <strong>{nav[page][0]}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-tag">
              <span className="dot" />{" "}
              {data?.company.isDemo ? "DATA SIMULASI" : "BUKU BESAR PERUSAHAAN"}
            </span>
            <div className="avatar small-avatar">KG</div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">KUNCI GROUP · AKUNTANSI & KEUANGAN</div>
              <h1>{page === 0 ? "Ringkasan keuangan" : nav[page][0]}</h1>
              <p>
                {page === 0
                  ? "Seluruh angka penting, dalam satu pandangan."
                  : "Kelola siklus akuntansi dengan pencatatan yang dapat ditelusuri."}
              </p>
            </div>
            <div className="heading-actions">
              <select
                aria-label="Periode fiskal"
                value={periodId}
                onChange={(e) => {
                  setPeriodId(e.target.value);
                  setPlan(null);
                  void load(e.target.value);
                }}
              >
                {data?.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.status}
                  </option>
                ))}
              </select>
              <Button
                disabled={!data || !open}
                onClick={() =>
                  setJournalType(
                    page === 5
                      ? "ADJUSTING"
                      : page === 1
                        ? "OPENING"
                        : "GENERAL",
                  )
                }
              >
                <Plus size={16} /> Buat jurnal
              </Button>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Tutup pesan">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Tutup pesan">
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="panel empty">
              <Loader2 className="spin" /> Memuat database…{" "}
              <Button variant="outline" onClick={() => void load()}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <>
              {page === 0 && (
                <>
                  <div className="period-strip">
                    <div>
                      <span className="live-dot" />
                      <strong>Periode {data.period.name}</strong>
                      <span className="muted">·</span>
                      <span>
                        {open
                          ? "Aktif menerima transaksi"
                          : "Sudah ditutup dan dikunci"}
                      </span>
                    </div>
                    <span className="badge green">
                      <CheckCircle2 size={13} />{" "}
                      {r?.balanceDifference === "0.00"
                        ? "Neraca seimbang"
                        : "Periksa selisih"}
                    </span>
                  </div>
                  <section className="kpi-grid">
                    {[
                      {
                        label: "Total kas",
                        value: r?.cash.ending ?? "0",
                        icon: Wallet,
                        note: "Saldo kas & setara kas",
                        color: "teal",
                      },
                      {
                        label: "Piutang usaha",
                        value: r?.receivables ?? "0",
                        icon: ArrowUpRight,
                        note: "Tagihan kepada pelanggan",
                        color: "blue",
                      },
                      {
                        label: "Utang usaha",
                        value: r?.payables ?? "0",
                        icon: ArrowDownLeft,
                        note: "Kewajiban kepada pemasok",
                        color: "orange",
                      },
                      {
                        label: "Laba bersih",
                        value: r?.profit ?? "0",
                        icon: ChartNoAxesCombined,
                        note: "Pendapatan dikurangi beban",
                        color: "teal",
                      },
                    ].map((k) => (
                      <article className="kpi panel" key={k.label}>
                        <div className="kpi-top">
                          <span>{k.label}</span>
                          <div className={`kpi-icon ${k.color}`}>
                            <k.icon size={19} />
                          </div>
                        </div>
                        <h2>{rupiah(k.value)}</h2>
                        <p>
                          <span className="tiny-dot" />
                          {k.note}
                        </p>
                      </article>
                    ))}
                  </section>
                  <section className="chart-grid">
                    <div className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Kinerja keuangan</h2>
                          <p>Pendapatan dan beban kumulatif periode</p>
                        </div>
                        <span className="badge neutral">IDR</span>
                      </div>
                      <div className="legend">
                        <span>
                          <i className="teal-bg" />
                          Pendapatan
                        </span>
                        <span>
                          <i className="orange-bg" />
                          Beban
                        </span>
                      </div>
                      <div className="chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={chart}
                            margin={{ left: 0, right: 24, top: 15, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient
                                id="revenue"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#1b8e78"
                                  stopOpacity={0.16}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#1b8e78"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 5"
                              vertical={false}
                              stroke="#e8eceb"
                            />
                            <XAxis
                              dataKey="day"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11, fill: "#84918e" }}
                              dy={8}
                            />
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11, fill: "#84918e" }}
                              width={48}
                            />
                            <Tooltip
                              formatter={(value) => rupiah(String(value))}
                            />
                            <Area
                              type="stepAfter"
                              dataKey="pendapatan"
                              name="Pendapatan"
                              stroke="#178a73"
                              strokeWidth={2.5}
                              fill="url(#revenue)"
                            />
                            <Area
                              type="stepAfter"
                              dataKey="beban"
                              name="Beban"
                              stroke="#d7a267"
                              strokeWidth={2}
                              fill="transparent"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-footer">
                        <span>{data.period.name}</span>
                        <span>Hanya jurnal posted · sebelum penutupan</span>
                      </div>
                    </div>
                    <div className="panel health">
                      <div className="panel-heading">
                        <div>
                          <h2>Kesehatan pembukuan</h2>
                          <p>Kontrol akuntansi periode ini</p>
                        </div>
                        <Scale size={19} />
                      </div>
                      <div className="balance-visual">
                        <div className="balance-ring">
                          <Check size={34} />
                        </div>
                        <h3>
                          {r?.balanceDifference === "0.00"
                            ? "Semua seimbang"
                            : "Perlu diperiksa"}
                        </h3>
                        <p>Debit dan kredit tercatat sesuai.</p>
                      </div>
                      <div className="health-line">
                        <span>Total debit NSSP</span>
                        <strong>{rupiah(r!.trialDebit)}</strong>
                      </div>
                      <div className="health-line">
                        <span>Total kredit NSSP</span>
                        <strong>{rupiah(r!.trialCredit)}</strong>
                      </div>
                      <div className="health-line">
                        <span>Selisih neraca</span>
                        <strong className="text-teal">
                          {rupiah(r!.balanceDifference)}
                        </strong>
                      </div>
                      <button className="text-link" onClick={() => setPage(4)}>
                        Lihat neraca saldo <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Transaksi terbaru{" "}
                          <span className="count">{journals.length}</span>
                        </h2>
                        <p>Aktivitas pencatatan pada periode terpilih</p>
                      </div>
                      <button className="text-link" onClick={() => setPage(2)}>
                        Lihat semua jurnal <ArrowRight size={15} />
                      </button>
                    </div>
                    {journalTable(journals.slice(0, 5))}
                  </section>
                  <div className="note">
                    <LockKeyhole size={14} />{" "}
                    {data.company.isDemo
                      ? "Angka berasal dari data simulasi superprompt, bukan transaksi resmi KBA."
                      : "Laporan hanya memuat jurnal yang diposting. Saldo awal dan dokumen historis yang belum diverifikasi belum tercakup."}
                  </div>
                </>
              )}
              {page === 1 && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Daftar akun</h2>
                        <p>Saldo normal otomatis mengikuti kategori akun.</p>
                      </div>
                    </div>
                    <form
                      className="account-form"
                      key={editing ?? "new"}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const ok = await mutate(
                          {
                            action: "account",
                            data: {
                              id: editing ?? undefined,
                              code: f.get("code"),
                              name: f.get("name"),
                              category: f.get("category"),
                              isCash: f.get("cash") === "on",
                              isContra: f.get("contra") === "on",
                            },
                          },
                          "Akun berhasil disimpan.",
                        );
                        if (ok) setEditing(null);
                      }}
                    >
                      <input
                        name="code"
                        aria-label="Kode akun"
                        placeholder="Kode akun"
                        required
                        pattern="[0-9]{3,10}"
                        defaultValue={rows.find((a) => a.id === editing)?.code}
                      />
                      <input
                        name="name"
                        aria-label="Nama akun"
                        placeholder="Nama akun"
                        required
                        defaultValue={rows.find((a) => a.id === editing)?.name}
                      />
                      <select
                        name="category"
                        aria-label="Kategori"
                        defaultValue={
                          rows.find((a) => a.id === editing)?.category
                        }
                      >
                        {[
                          "ASET",
                          "KEWAJIBAN",
                          "EKUITAS",
                          "PENDAPATAN",
                          "BEBAN",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          name="cash"
                          defaultChecked={
                            rows.find((a) => a.id === editing)?.isCash
                          }
                        />
                        Akun kas
                      </label>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          name="contra"
                          defaultChecked={
                            rows.find((a) => a.id === editing)?.isContra
                          }
                        />
                        Akun kontra
                      </label>
                      <Button disabled={busy}>
                        {editing ? "Simpan perubahan" : "Tambah akun"}
                      </Button>
                      {editing && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditing(null)}
                        >
                          Batal
                        </Button>
                      )}
                    </form>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Kode</th>
                            <th>Nama akun</th>
                            <th>Kategori</th>
                            <th>Saldo normal</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((a) => (
                            <tr key={a.id}>
                              <td>
                                <strong>{a.code}</strong>
                              </td>
                              <td>
                                {a.name}{" "}
                                {a.isSystemAccount && (
                                  <span className="badge neutral">Sistem</span>
                                )}
                              </td>
                              <td>{a.category}</td>
                              <td>{a.normalBalance}</td>
                              <td>
                                {!a.isSystemAccount && (
                                  <div className="actions">
                                    <button
                                      className="text-link"
                                      onClick={() => setEditing(a.id)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="icon-button"
                                      title="Hapus akun"
                                      onClick={() => {
                                        if (confirm(`Hapus akun ${a.code}?`))
                                          void mutate(
                                            {
                                              action: "deleteAccount",
                                              id: a.id,
                                            },
                                            "Akun dihapus.",
                                          );
                                      }}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="note">
                    Saldo awal dimasukkan sebagai jurnal OPENING. Akun sistem
                    dan akun yang sudah dipakai dilindungi dari perubahan.
                  </div>
                </>
              )}
              {(page === 2 || page === 5) && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {page === 5 ? "Jurnal penyesuaian" : "Register jurnal"}
                      </h2>
                      <p>Jurnal posted dikoreksi dengan jurnal pembalik.</p>
                    </div>
                    <div className="search">
                      <Search size={16} />
                      <input
                        aria-label="Cari jurnal"
                        placeholder="Cari nomor atau transaksi…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {journalTable(
                    page === 5
                      ? filtered.filter((e) => e.type === "ADJUSTING")
                      : filtered,
                  )}
                </section>
              )}
              {page === 3 && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Mutasi & saldo berjalan</h2>
                      <p>
                        Saldo berjalan memasukkan mutasi sebelum tanggal awal
                        filter. Termasuk jurnal penutup pada periode yang sudah
                        dikunci.
                      </p>
                    </div>
                  </div>
                  <div className="filters">
                    <select
                      aria-label="Akun buku besar"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                    >
                      {rows.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </select>
                    <label>
                      Dari
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Sampai
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Nomor jurnal</th>
                          <th>Deskripsi</th>
                          <th className="num">Debit</th>
                          <th className="num">Kredit</th>
                          <th className="num">Saldo ({normal})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerRows.map((v, i) => (
                          <tr key={i}>
                            <td>{date(v.entry.transactionDate)}</td>
                            <td>{v.entry.journalNumber}</td>
                            <td>{v.entry.description}</td>
                            <td className="num">
                              {rupiah(String(v.line.debit))}
                            </td>
                            <td className="num">
                              {rupiah(String(v.line.credit))}
                            </td>
                            <td className="num strong">{rupiah(v.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!ledgerRows.length && (
                      <div className="empty">
                        Tidak ada mutasi pada filter ini.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {page === 4 && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Kertas kerja terpadu</h2>
                      <p>
                        Nilai sebelum dan penyesuaian bertanda positif untuk
                        debit, negatif untuk kredit.
                      </p>
                    </div>
                    <a
                      href={exportLink("xlsx")}
                      className="button button-outline"
                    >
                      <Download size={15} /> Excel
                    </a>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Akun</th>
                          <th className="num">Sebelum (D−K)</th>
                          <th className="num">Penyesuaian (D−K)</th>
                          <th className="num">Debit NSSP</th>
                          <th className="num">Kredit NSSP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.code}</strong> {a.name}
                            </td>
                            <td className="num">{rupiah(a.before)}</td>
                            <td className="num">{rupiah(a.adjustment)}</td>
                            <td className="num">{rupiah(a.debit)}</td>
                            <td className="num">{rupiah(a.credit)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>TOTAL</td>
                          <td />
                          <td />
                          <td className="num">{rupiah(r!.trialDebit)}</td>
                          <td className="num">{rupiah(r!.trialCredit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}
              {page === 6 && (
                <>
                  <div className="report-toolbar">
                    <span className="badge green">
                      <Check size={14} /> Dari neraca saldo setelah penyesuaian
                    </span>
                    <div className="actions">
                      <a
                        className="button button-outline"
                        href={exportLink("xlsx")}
                      >
                        <Download size={15} /> Excel
                      </a>
                      <a
                        className="button button-outline"
                        href={exportLink("pdf")}
                      >
                        <Download size={15} /> PDF
                      </a>
                    </div>
                  </div>
                  <div className="report-grid">
                    <Statement
                      title="Laporan laba rugi"
                      items={[
                        ["Pendapatan", r!.revenue],
                        ["Beban", r!.expense],
                      ]}
                      total={["Laba / rugi bersih", r!.profit]}
                    />
                    <Statement
                      title="Perubahan modal"
                      items={[
                        ["Modal sebelum laba & prive", r!.capitalBefore],
                        ["Laba bersih", r!.profit],
                        ["Prive (dikurangkan)", r!.drawings],
                      ]}
                      total={["Modal akhir", r!.equity]}
                    />
                    <Statement
                      title="Posisi keuangan"
                      items={[
                        ["Total aset", r!.assets],
                        ["Kewajiban", r!.liabilities],
                        ["Ekuitas akhir", r!.equity],
                      ]}
                      total={[
                        "Selisih Aset − Kewajiban − Ekuitas",
                        r!.balanceDifference,
                      ]}
                    />
                    <Statement
                      title="Arus kas"
                      items={[
                        ["Saldo kas awal", r!.cash.opening],
                        ["Operasional", r!.cash.operating],
                        ["Investasi", r!.cash.investing],
                        ["Pendanaan", r!.cash.financing],
                      ]}
                      total={["Saldo kas akhir", r!.cash.ending]}
                    />
                  </div>
                  <div className="note">
                    Laporan historis memakai jurnal sebelum penutupan. Angka
                    akuntansi dihitung dalam satuan sen; tampilan dan grafik
                    memformat hasilnya.
                  </div>
                </>
              )}
              {page === 7 && (
                <>
                  <section className="panel closing">
                    <div className="closing-icon">
                      <LockKeyhole size={28} />
                    </div>
                    <h2>Tutup periode {data.period.name}</h2>
                    <p>
                      Tinjau jurnal penutup sebelum mengunci periode. Pendapatan
                      dan beban dipindahkan ke modal; saldo neraca diteruskan ke
                      periode berikutnya.
                    </p>
                    <span className={`badge ${open ? "green" : "neutral"}`}>
                      {open ? "PERIODE TERBUKA" : "PERIODE TERKUNCI"}
                    </span>
                    <div>
                      <Button
                        disabled={!open || busy}
                        onClick={async () => {
                          try {
                            const b = await act({
                              action: "preview",
                              periodId,
                            });
                            setPlan(b.groups);
                          } catch {}
                        }}
                      >
                        Pratinjau jurnal penutup <ArrowRight size={15} />
                      </Button>
                    </div>
                  </section>
                  {plan && (
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Pratinjau penutupan</h2>
                          <p>
                            {plan.length} jurnal akan dibuat. Saldo dihitung
                            ulang saat konfirmasi.
                          </p>
                        </div>
                      </div>
                      {plan.map((g, i) => (
                        <div className="closing-group" key={i}>
                          <h3>
                            {i + 1}. {g.description}
                          </h3>
                          <table>
                            <thead>
                              <tr>
                                <th>Akun</th>
                                <th className="num">Debit</th>
                                <th className="num">Kredit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.lines.map((l, j) => (
                                <tr key={j}>
                                  <td>
                                    {
                                      rows.find((a) => a.id === l.accountId)
                                        ?.name
                                    }
                                  </td>
                                  <td className="num">{rupiah(l.debit)}</td>
                                  <td className="num">{rupiah(l.credit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                      <div className="panel-footer">
                        <Button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Kunci permanen periode ${data.period.name} dan buat saldo awal periode berikutnya?`,
                              )
                            )
                              void mutate(
                                { action: "close", periodId },
                                "Periode berhasil ditutup. Saldo awal periode berikutnya sudah dibuat.",
                              );
                          }}
                        >
                          <LockKeyhole size={16} /> Konfirmasi tutup buku
                        </Button>
                      </div>
                    </section>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Jejak audit</h2>
                        <p>50 aktivitas terakhir, termasuk periode lain.</p>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Aktivitas</th>
                            <th>Referensi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.audit.map((a) => (
                            <tr key={a.id}>
                              <td>
                                {new Date(a.createdAt).toLocaleString("id-ID", {
                                  timeZone: "Asia/Jakarta",
                                })}{" "}
                                WIB
                              </td>
                              <td>{a.action}</td>
                              <td>{a.entityId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="footer">
            <span>© 2026 Kunci Group</span>
            <span>
              Finance workspace <span className="dot" /> IDR · Indonesia
            </span>
          </footer>
        </main>
      </div>
      {journalType && data && (
        <JournalForm
          type={journalType}
          data={data}
          onClose={() => setJournalType(null)}
          onSave={async (values) => {
            await act({ action: "journal", data: values });
            setJournalType(null);
            setNotice("Jurnal berhasil disimpan.");
            await load();
          }}
        />
      )}
    </div>
  );
}
function Statement({
  title,
  items,
  total,
}: {
  title: string;
  items: string[][];
  total: string[];
}) {
  return (
    <section className="panel statement">
      <h2>{title}</h2>
      {items.map(([label, value]) => (
        <div className="statement-line" key={label}>
          <span>{label}</span>
          <strong>{rupiah(value)}</strong>
        </div>
      ))}
      <div className="statement-total">
        <span>{total[0]}</span>
        <strong>{rupiah(total[1])}</strong>
      </div>
    </section>
  );
}
