"use client";
import { useState, useEffect } from "react";
import {
  LayoutGrid,
  MessagesSquare,
  Wallet,
  TrendingUp,
  ChartNoAxesCombined,
  Landmark,
  ShoppingCart,
  Boxes,
  ScanLine,
  Users,
  Receipt,
  Grid2X2,
  Settings2,
  Monitor,
  CookingPot,
  BriefcaseBusiness,
  Clock3,
  MapPin,
  ShieldCheck,
  Wrench,
  Database,
  FileInput,
  FolderSearch,
  Plus,
  Search,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LogOut,
  LockKeyhole,
  Check,
  AlertCircle,
  ExternalLink,
  Send,
  Loader2,
  Menu,
  X,
  Download,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  modules,
  definitions,
  masterDefinitions,
  financialModules,
} from "@/lib/operations/registry";
import {
  MasterEditor,
  RecordEditor,
  Modal,
  type Master,
  type RecordData,
  type Branch,
} from "./operation-forms";
import { BarcodeWorkspace } from "./scanner";
import { PasswordGate } from "./password-gate";
import {employeeModules} from "@/lib/roles";
import {DataDetails} from "./data-details";
import { SourceDataExplorer } from "./source-data-explorer";
import { SettingsWorkspace } from "./settings-workspace";
import { ModuleMiniDashboard } from "./module-mini-dashboard";
const icons: Record<string, typeof Wallet> = {
  MessagesSquare,
  Wallet,
  TrendingUp,
  ChartNoAxesCombined,
  Landmark,
  ShoppingCart,
  Boxes,
  ScanLine,
  Users,
  Receipt,
  Grid2X2,
  Settings2,
  Monitor,
  CookingPot,
  BriefcaseBusiness,
  Clock3,
  MapPin,
  ShieldCheck,
  Wrench,
};
export type AppState = {
  insights: {
    month: string;
    ledgerMonth?: string;
    ledgerBasis?: "BULAN_BERJALAN" | "BULAN_TERAKHIR_TERSEDIA";
    financial: boolean;
    branches: {
      branchId: string | null;
      revenue: string;
      expense: string;
      profit: string;
    }[];
    projects: {
      projectId: string;
      total: number;
      completed: number;
      onTime: number;
      onTimePercent: number;
    }[];
  };
  permissions: {
    companyWide: boolean;
    sourceAccess: boolean;
    financialAccess: boolean;
  };
  actor: {
    id: string;
    name: string;
    email: string;
    superuser: boolean;
    mustChangePassword: boolean;
  };
  companies: {
    id: string;
    name: string;
    code: string;
    isDemo: boolean;
    active: boolean;
  }[];
  company: {
    id: string;
    name: string;
    isDemo: boolean;
    settings: Record<string, unknown>;
  };
  role: string;
  branches: Branch[];
  modules: ((typeof modules)[number] & { enabled: boolean })[];
  masters: Master[];
  records: RecordData[];
  page: number;
  pageSize: number;
  total: number;
  stock: {
    id: string;
    productId: string;
    warehouseId: string;
    branchId: string;
    lotCode: string;
    expiresAt: string | null;
    quantity: string;
    unitCost: string;
    value: string;
    quarantined: boolean;
  }[];
  messages: {
    id: string;
    authorName: string;
    body: string;
    system: boolean;
    channel: string;
    createdAt: string;
  }[];
  financialStats: {
    module: string;
    status: string;
    _count: number;
    _sum: { amount: string | null; settled: string | null };
  }[];
  stats: {
    module: string;
    status: string;
    _count: number;
    _sum: { amount: string | null; settled: string | null };
  }[];
  imports: { kind: string; status: string; _count: number }[];
  sourceCount: number;
  masterFiles?: {id:string;name:string}[];
  assignedRole?: string;
  users: {
    id: string;
    name: string;
    email: string | null;
    username?: string | null;
    isSuperuser?: boolean;
    active: boolean;
    mustChangePassword: boolean;
    grants: { companyId: string; role: string; branchIds: string[]; managerId?: string | null; employeeId?: string | null; active?: boolean }[];
  }[];
};
const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
  });
const labels: Record<string, string> = {
  IMPORTED: "Perlu verifikasi",
  DRAFT: "Draft",
  SUBMITTED: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  POSTED: "Diposting",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};
const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
export default function OperationWorkspace() {
  const [employeeScope,setEmployeeScope]=useState("current");
  const [masterInfo,setMasterInfo]=useState<Master|null>(null);
  const [forcePassword, setForcePassword] = useState(false);
  const [state, setState] = useState<AppState | null>(null),
    [company, setCompany] = useState("KBA"),
    [branch, setBranch] = useState(""),
    [view, setView] = useState("home"),
    [kind, setKind] = useState("PRODUCT"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [login, setLogin] = useState(false),
    [email, setEmail] = useState("admin@kuncigroup.cloud"),
    [password, setPassword] = useState(""),
    [mobile, setMobile] = useState(false),
    [recordEditor, setRecordEditor] = useState<{
      module: string;
      record?: RecordData;
      initialData?: Record<string, unknown>;
    } | null>(null),
    [masterEditor, setMasterEditor] = useState<{
      kind: string;
      record?: Master;
    } | null>(null),
    [detail, setDetail] = useState<RecordData | null>(null),
    [channel, setChannel] = useState("umum"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [importRows, setImportRows] = useState<
      {
        id: string;
        sourceFileId: string;
        sheet: string;
        row: number;
        kind: string;
        status: string;
        issue: string;
        targetId: string | null;
        data: Record<string, unknown>;
      }[]
    >([]),
    [sourceFiles, setSourceFiles] = useState<
      {
        id: string;
        name: string;
        url: string;
        path: string;
        status: string;
        rowCount: number;
        notes: string;
      }[]
    >([]),
    [listTotal, setListTotal] = useState(0);
  async function load(
    cid = company,
    v = view,
    bid = branch,
    p = page,
    q = query,
  ) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ company: cid, page: String(p) });
      if (bid) params.set("branch", bid);
      if (q) params.set("q", q);
      if (
        definitions.some((m) => m.key === v) &&
        ![
          "home",
          "dashboards",
          "apps",
          "settings",
          "barcode",
          "employees",
          "discuss",
        ].includes(v)
      )
        params.set("module", v);
      const r = await fetch(`/api/operations?${params}`);
      const body = await r.json();
      if (r.status === 401) {
        setLogin(true);
        return;
      }
      if (r.status === 428) {
        setForcePassword(true);
        return;
      }
      if (!r.ok) throw new Error(body.error);
      setState(body);
      setCompany(cid);
      setLogin(false);
      if (v === "imports" || v === "sources") {
        params.set("view", v);
        const res = await fetch(`/api/operations?${params}`);
        const b = await res.json();
        if (!res.ok) throw new Error(b.error);
        setListTotal(b.total);
        if (v === "imports") setImportRows(b.rows);
        else setSourceFiles(b.files);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Koneksi gagal.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const remembered = localStorage.getItem("kunci-company") ?? "KBA";
    const m =
      new URL(window.location.href).searchParams.get("module") ?? "home";
    setCompany(remembered);
    setView(m);
    void fetch("/api/session")
      .then((r) => r.json())
      .then((b) => {
        if (!b.actor) {
          setLogin(true);
          setLoading(false);
          return;
        }
        const cid = b.actor.superuser
          ? remembered
          : b.actor.grants.some(
                (g: { companyId: string }) => g.companyId === remembered,
              )
            ? remembered
            : (b.actor.grants[0]?.companyId ?? remembered);
        setCompany(cid);
        void load(cid, m, "", 0, "");
      })
      .catch(() => void load(remembered, m, "", 0, ""));
  }, []);
  async function act(action: string, data: unknown, companyId = company) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, companyId, data }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setNotice("Perubahan berhasil disimpan.");
      return b.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operasi gagal.");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: string) {
    setView(v);
    setPage(0);
    setQuery("");
    setDetail(null);
    setMobile(false);
    void load(company, v, branch, 0, "");
    history.replaceState(null, "", v === "home" ? "/" : `/?module=${v}`);
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      const session = await fetch("/api/session").then((r) => r.json());
      const cid = session.actor?.superuser
        ? "KBA"
        : (session.actor?.grants[0]?.companyId ?? "KBA");
      setCompany(cid);
      setPassword("");
      localStorage.setItem("kunci-company", cid);
      await load(cid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login gagal");
    } finally {
      setBusy(false);
    }
  }
  async function transition(r: RecordData, action: string) {
    const rd = (r.data ?? {}) as Record<string, unknown>;
    let reason: string | null | undefined =
      action === "reject" ? prompt("Alasan penolakan") : undefined;
    if (action === "reject" && !reason) return;
    if (
      action === "approve" &&
      r.module === "purchase" &&
      rd.documentType === "ORDER" &&
      rd.projectId &&
      (state?.assignedRole === "ADMIN" || state?.role === "ADMIN")
    )
      reason =
        prompt(
          "Alasan override kuota proyek (kosongkan bila PO masih dalam kuota)",
        ) || undefined;
    if (
      ["post", "cancel"].includes(action) &&
      !confirm(
        `${action === "post" ? "Finalisasi" : "Batalkan"} ${r.number}? ${action === "post" ? "Posting dapat berdampak ke stok dan pembukuan." : ""}`,
      )
    )
      return;
    try {
      await act("transition", {
        id: r.id,
        companyId: company,
        version: r.version,
        action,
        reason,
      });
      setDetail(null);
      await load();
    } catch {}
  }
  const opsRequired = (module: string) =>
    Boolean(
      (
        (state?.company.settings?.approval as
          | Record<string, { requireOpsVerification?: boolean }>
          | undefined) ?? {}
      )[module]?.requireOpsVerification,
    );
  const masters = state?.masters ?? [];
  const def = definitions.find((m) => m.key === view);
  const employeeView = view === "employees";
  const masterMode = view === "masters" || employeeView;
  const currentKind = employeeView ? "EMPLOYEE" : kind;
  const pendingCount =
    state?.stats
      .filter((s) => s.status === "SUBMITTED")
      .reduce((n, s) => n + s._count, 0) ?? 0;
  const totalValue = (key: string, unsettled = false) =>
    state?.financialStats
      .filter((s) => s.module === key && s.status === "POSTED")
      .reduce(
        (n, s) =>
          n +
          Number(s._sum.amount ?? 0) -
          (unsettled ? Number(s._sum.settled ?? 0) : 0),
        0,
      ) ?? 0;
  const count = (key: string) =>
    state?.stats
      .filter((s) => s.module === key)
      .reduce((n, s) => n + s._count, 0) ?? 0;
  const editable = state && !["AUDITOR"].includes(state.role);
  const canManage =
    state && ["ADMIN", "MANAGER", "HR", "FINANCE"].includes(state.role);
  const canEditMasterKind=(k:string)=>!!state&&(["EMPLOYEE","DEPARTMENT","POSITION"].includes(k)?["ADMIN","MANAGER","HR"].includes(state.role):["ADMIN","MANAGER","FINANCE","SUPERVISOR"].includes(state.role));
  const canCreateModule=(key:string)=>!!state&&state.role!=="AUDITOR"&&(state.assignedRole==="EMPLOYEE"?employeeModules.has(key):state.role==="STAFF"?["cash-advance","expenses","attendances","timesheets","project","quality","maintenance"].includes(key):state.role==="HR"?["attendances","timesheets","shifts"].includes(key):true);
  const displayMasters = masters.filter(
    (m) =>
      m.kind === currentKind &&
      (currentKind!=="EMPLOYEE"||employeeScope==="all"||state?.role==="STAFF"||m.data.currentRoster===true) &&
      `${m.name} ${m.code} ${m.data.workId??""} ${m.data.position??""} ${m.data.department??""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const table = (records: RecordData[]) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Dokumen</th>
            <th>Tanggal</th>
            <th>Cabang</th>
            <th className="num">Nilai</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="click-row" onClick={() => setDetail(r)}>
              <td>
                <strong>{r.number}</strong>
                <span className="cell-sub">{r.title}</span>
              </td>
              <td>{formatDate(r.date)}</td>
              <td>
                {state?.branches.find((b) => b.id === r.branchId)?.name ??
                  "Kantor pusat"}
              </td>
              <td className="num">
                <strong>{money(r.amount)}</strong>
                {Number(r.settled) > 0 && (
                  <span className="cell-sub">
                    Sisa {money(Number(r.amount) - Number(r.settled))}
                  </span>
                )}
              </td>
              <td>
                <span
                  className={`badge ${r.status === "POSTED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}`}
                >
                  {labels[r.status]}
                </span>
              </td>
              <td>
                <ArrowRight size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!records.length && (
        <div className="empty">
          Belum ada dokumen. Buat transaksi pertama untuk memulai.
        </div>
      )}
    </div>
  );
  if (forcePassword)
    return (
      <PasswordGate
        onDone={() => {
          setForcePassword(false);
          setState(null);
          setLogin(true);
          setNotice("Kata sandi berhasil diganti. Masuk kembali.");
        }}
      />
    );
  if (login)
    return (
      <main className="erp-login">
        <div className="login-brand">
          <span className="eyebrow">KUNCI GROUP</span>
          <h1>
            Satu workspace.
            <br />
            Seluruh operasi.
          </h1>
          <p>
            Keuangan, personel, proyek, dan persediaan dalam satu alur
            pencatatan.
          </p>
          <div className="login-chips">
            <span>19 aplikasi</span>
            <span>Multi-company</span>
            <span>Hak akses per pengguna</span>
          </div>
        </div>
        <form className="panel login-panel" onSubmit={signIn}>
          <div className="brand-mark">K</div>
          <h2>Masuk ke workspace</h2>
          <p>Gunakan akun yang diberikan administrator.</p>
          <label>
            Email atau username
            <input
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Kata sandi
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <Button disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <LockKeyhole size={16} />
            )}{" "}
            Masuk dengan aman
          </Button>
          <small>Data perusahaan tersedia hanya setelah autentikasi.</small>
        </form>
      </main>
    );
  return (
    <div className="workspace ops-workspace">
      <aside className={`sidebar ops-sidebar ${mobile ? "show" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <div className="brand-mark">
            K<span />
          </div>
          <div>
            KUNCI GROUP<small>OPERATIONS WORKSPACE</small>
          </div>
        </a>
        <div className="company">
          <div className="company-icon">
            <BriefcaseBusiness size={18} />
          </div>
          <div>
            <strong>{state?.company.name ?? "Memuat workspace"}</strong>
            <small>
              {state?.company.isDemo ? "Data simulasi" : "Multi-company ERP"}
            </small>
          </div>
        </div>
        <nav className="ops-nav">
          <button
            className={`nav-item ${view === "home" ? "active" : ""}`}
            onClick={() => navigate("home")}
          >
            <LayoutGrid size={18} /> Semua aplikasi
          </button>
          <button
            className={`nav-item ${view === "masters" ? "active" : ""}`}
            onClick={() => navigate("masters")}
          >
            <Database size={18} /> Master data
          </button>
          <div className="nav-label">APLIKASI</div>
          {(state?.modules ?? modules.map((m) => ({ ...m, enabled: true })))
            .filter((m) => m.enabled && m.key !== "accounting")
            .map((m) => {
              const Icon = icons[m.icon] ?? Boxes;
              return (
                <button
                  key={m.key}
                  className={`nav-item ${view === m.key ? "active" : ""}`}
                  onClick={() => navigate(m.key)}
                >
                  <Icon size={17} />
                  <span>{m.name}</span>
                  {count(m.key) > 0 && <small>{count(m.key)}</small>}
                </button>
              );
            })}
          <a className="nav-item" href={`/accounting?company=${company}`}>
            <Landmark size={17} /> Accounting <ExternalLink size={12} />
          </a>
          <button
            className={`nav-item ${view === "payments" ? "active" : ""}`}
            onClick={() => navigate("payments")}
          >
            <Wallet size={17} /> Pembayaran
          </button>
          <div className="nav-label">SUMBER & KONTROL</div>
          <button className={`nav-item ${view === "source-data" ? "active" : ""}`} onClick={() => navigate("source-data")}><Database size={18}/>Data unggahan</button>
          {state?.permissions.sourceAccess && (
            <>
              <button
                className={`nav-item ${view === "imports" ? "active" : ""}`}
                onClick={() => navigate("imports")}
              >
                <FileInput size={17} /> Verifikasi impor
              </button>
              <button
                className={`nav-item ${view === "sources" ? "active" : ""}`}
                onClick={() => navigate("sources")}
              >
                <FolderSearch size={17} /> Register sumber Drive
              </button>
            </>
          )}
        </nav>
        <button
          className="profile"
          onClick={async () => {
            await fetch("/api/session", { method: "DELETE" });
            setState(null);
            setLogin(true);
          }}
        >
          <div className="avatar">
            {state?.actor.name
              .split(" ")
              .slice(0, 2)
              .map((s) => s[0])
              .join("") ?? "KG"}
          </div>
          <div>
            <strong>{state?.actor.name ?? "Workspace"}</strong>
            <small>{state?.role ?? "Sesi terautentikasi"}</small>
          </div>
          <LogOut size={15} />
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-toggle icon-button"
              aria-label="Buka menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Kunci Group</span>
            <span>/</span>
            <strong>
              {view === "home"
                ? "Semua aplikasi"
                : masterMode
                  ? masterDefinitions[currentKind]?.label
                  : (def?.name ??
                    (view === "imports"
                      ? "Verifikasi impor"
                      : view==="source-data"?"Data unggahan":"Register sumber"))}
            </strong>
          </div>
          <div className="top-actions">
            <span className="demo-tag">
              <span className="dot" />
              {state?.company.isDemo ? "SIMULASI" : "WORKSPACE PERUSAHAAN"}
            </span>
            <select
              aria-label="Perusahaan aktif"
              value={company}
              onChange={(e) => {
                const c = e.target.value;
                setCompany(c);
                setBranch("");
                setPage(0);
                localStorage.setItem("kunci-company", c);
                void load(c, view, "", 0, query);
              }}
            >
              {state?.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="content ops-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {state?.company.name ?? "KUNCI GROUP"} · {state?.assignedRole ?? state?.role ?? "ERP"}
              </span>
              <h1>
                {view === "home"
                  ? "Workspace Kunci Group"
                  : masterMode
                    ? masterDefinitions[currentKind].label
                    : (def?.name ??
                      (view === "imports"
                        ? "Verifikasi data sumber"
                        : view==="source-data"?"Data unggahan terintegrasi":"Register Google Drive"))}
              </h1>
              <p>
                {view === "home"
                  ? "Kelola seluruh unit kerja dan transaksi dari satu tempat."
                  : (def?.subtitle ??
                    "Data terstruktur dengan asal berkas yang dapat ditelusuri.")}
              </p>
            </div>
            <div className="heading-actions">
              <select
                aria-label="Filter cabang"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPage(0);
                  void load(company, view, e.target.value, 0, query);
                }}
              >
                <option value="">Semua cabang yang diizinkan</option>
                {state?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {masterMode && canEditMasterKind(currentKind) && (
                <Button onClick={() => setMasterEditor({ kind: currentKind })}>
                  <Plus size={16} /> Tambah master
                </Button>
              )}
              {def && (def.fields.length || def.lines) && canCreateModule(view) && (
                <Button onClick={() => setRecordEditor({ module: view })}>
                  <Plus size={16} /> Buat dokumen
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Tutup pesan">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Tutup pesan">
                <X size={16} />
              </button>
            </div>
          )}
          {!state ? (
            <div className="panel empty">
              <Loader2 className="spin" /> Memuat workspace…{" "}
              <Button variant="outline" onClick={() => void load()}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <>
              {state.actor.mustChangePassword && (
                <div className="alert error">
                  <span>
                    Gunakan Settings untuk mengganti kata sandi awal sebelum
                    memproses data perusahaan.
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => navigate("settings")}
                  >
                    Ganti kata sandi
                  </Button>
                </div>
              )}
              {state.modules.some(m => m.key === view) && !state.actor.mustChangePassword && <ModuleMiniDashboard key={`${company}:${view}:${branch}:${query}`} company={company} module={view} branch={branch} query={query} revision={state} />}
              {(view === "home" || view === "dashboards") && (
                <>
                  <section className="ops-hero">
                    <div>
                      <span className="eyebrow">OPERASI TERINTEGRASI</span>
                      <h2>{state.company.name}</h2>
                      <p>
                        {state.company.isDemo
                          ? "Lingkungan latihan terpisah dari perusahaan operasional."
                          : "Setiap transaksi memiliki perusahaan, lokasi, persetujuan, dan jejak pencatatan."}
                      </p>
                      {state.permissions.sourceAccess && (
                        <div className="hero-links">
                          <button onClick={() => navigate("imports")}>
                            <FileInput size={15} />{" "}
                            {state.imports
                              .filter((i) => i.status === "REVIEW")
                              .reduce((s, i) => s + i._count, 0)
                              .toLocaleString("id-ID")}{" "}
                            baris perlu verifikasi <ArrowRight size={14} />
                          </button>
                          <button onClick={() => navigate("sources")}>
                            {state.sourceCount.toLocaleString("id-ID")} entri
                            sumber <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="hero-stat">
                      <strong>
                        {state.modules.filter((m) => m.enabled).length}
                      </strong>
                      <span>Aplikasi aktif</span>
                      <small>{state.branches.length} cabang / lokasi</small>
                    </div>
                  </section>
                  <section className="kpi-grid ops-kpis">
                    {[
                      {
                        name: "Penjualan diposting",
                        value: money(totalValue("sales") + totalValue("pos")),
                        icon: TrendingUp,
                        note: "Dokumen aktual yang sudah diposting",
                      },
                      {
                        name: "Piutang belum lunas",
                        value: money(totalValue("sales", true)),
                        icon: Receipt,
                        note: "Saldo invoice pelanggan",
                      },
                      {
                        name: "Kasbon belum selesai",
                        value: money(totalValue("cash-advance", true)),
                        icon: Wallet,
                        note: "Dikurangi pertanggungjawaban & pengembalian",
                      },
                      {
                        name: "Menunggu persetujuan",
                        value: String(pendingCount),
                        icon: ShieldCheck,
                        note: "Dokumen yang sudah diajukan",
                      },
                    ].map((k) => (
                      <article className="panel kpi" key={k.name}>
                        <div className="kpi-top">
                          <span>{k.name}</span>
                          <div className="kpi-icon teal">
                            <k.icon size={18} />
                          </div>
                        </div>
                        <h2>{k.value}</h2>
                        <p>{k.note}</p>
                      </article>
                    ))}
                  </section>
                  {view === "home" ? (
                    <>
                      <div className="section-label">
                        <h2>Aplikasi Anda</h2>
                        <span>19 aplikasi · satu alur kerja</span>
                      </div>
                      <div className="app-grid">
                        {state.modules.map((m) => {
                          const Icon = icons[m.icon] ?? Boxes;
                          return (
                            <button
                              key={m.key}
                              className={`app-tile ${!m.enabled ? "app-disabled" : ""}`}
                              disabled={!m.enabled}
                              onClick={() =>
                                m.key === "accounting"
                                  ? location.assign(
                                      `/accounting?company=${company}`,
                                    )
                                  : navigate(m.key)
                              }
                            >
                              <div className={`app-icon ${m.color}`}>
                                <Icon size={24} />
                              </div>
                              <div>
                                <h3>{m.name}</h3>
                                <p>{m.subtitle}</p>
                              </div>
                              <span className="app-arrow">
                                <ArrowRight size={16} />
                              </span>
                              {!m.enabled && <small>Nonaktif</small>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="report-grid">
                      <section className="panel statement">
                        <h2>Aktivitas per modul</h2>
                        {modules
                          .filter((m) => count(m.key))
                          .map((m) => (
                            <div className="statement-line" key={m.key}>
                              <span>{m.name}</span>
                              <strong>{count(m.key)} dokumen</strong>
                            </div>
                          ))}
                        {!state.stats.length && (
                          <p>Belum ada transaksi pada perusahaan ini.</p>
                        )}
                      </section>
                      <section className="panel statement">
                        <h2>Kontrol operasional</h2>
                        {[
                          [
                            "Stok dikarantina",
                            state.stock.filter((l) => l.quarantined).length,
                          ],
                          [
                            "Lot kedaluwarsa",
                            state.stock.filter(
                              (l) =>
                                l.expiresAt &&
                                l.expiresAt.slice(0, 10) <
                                  new Date().toISOString().slice(0, 10) &&
                                Number(l.quantity) > 0,
                            ).length,
                          ],
                          [
                            "Sertifikat habis berlaku",
                            masters.filter(
                              (m) =>
                                m.kind === "EMPLOYEE" &&
                                m.data.certificateExpiry &&
                                String(m.data.certificateExpiry) <
                                  new Date().toISOString().slice(0, 10),
                            ).length,
                          ],
                          [
                            "Utang tagihan belum lunas",
                            money(
                              totalValue("purchase", true) +
                                totalValue("expenses", true) +
                                totalValue("maintenance", true),
                            ),
                          ],
                        ].map(([label, v]) => (
                          <div className="statement-line" key={label}>
                            <span>{label}</span>
                            <strong>{v}</strong>
                          </div>
                        ))}
                        <a
                          className="text-link"
                          href={`/accounting?company=${company}`}
                        >
                          Buka laporan keuangan dari buku besar{" "}
                          <ArrowRight size={15} />
                        </a>
                      </section>
                    </div>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Dokumen terbaru</h2>
                        <p>
                          Data historis berstatus perlu verifikasi belum
                          memengaruhi pembukuan.
                        </p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => navigate("sales")}
                      >
                        Buka Sales <ArrowRight size={14} />
                      </button>
                    </div>
                    {table(state.records.slice(0, 6))}
                  </section>
                </>
              )}
              {["source-data","employees","attendances","inventory","dashboards"].includes(view) && <SourceDataExplorer key={view} state={state} branch={branch} initialKind={view==='inventory'?'STOCK_SNAPSHOT':['employees','attendances'].includes(view)?'ATTENDANCE':''} onReview={async(data)=>{await act('reviewSource',data);}} onOpening={async(data)=>{await act('prepareStockOpening',data);await load();}}/>}
              {masterMode && (
                <section className="panel">
                  <div className="panel-heading">
                    <div className="master-tabs">
                      {!employeeView &&
                        Object.entries(masterDefinitions).map(([k, m]) => (
                          <button
                            className={k === kind ? "selected" : ""}
                            key={k}
                            onClick={() => setKind(k)}
                          >
                            {m.label}
                          </button>
                        ))}
                    </div>
                    {currentKind==='EMPLOYEE'&&<select aria-label="Cakupan karyawan" value={employeeScope} onChange={e=>setEmployeeScope(e.target.value)}><option value="current">Roster 17 November 2026</option><option value="all">Semua termasuk referensi historis</option></select>}
                    <div className="search">
                      <Search size={15} />
                      <input
                        placeholder="Cari kode atau nama…"
                        aria-label="Cari master"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Kode</th>
                          <th>Nama</th>
                          <th>Cabang</th>
                          <th>Detail</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {displayMasters.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{String(m.data.workId??m.code)}</strong>

                            </td>
                            <td><button className="text-link" onClick={()=>setMasterInfo(m)}>{m.name}</button></td>
                            <td>
                              {state.branches.find((b) => b.id === m.branchId)
                                ?.name ?? "Bersama perusahaan"}
                            </td>
                            <td>
                              {String(
                                m.data.position ??
                                  m.data.type ??
                                  m.data.serial ??
                                  m.data.cluster ??
                                  "—",
                              )}
                              {Boolean(m.data.certificateExpiry) && (
                                <span className="cell-sub">
                                  Sertifikat hingga{" "}
                                  {String(m.data.certificateExpiry)}
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${m.active ? "green" : "neutral"}`}
                              >
                                {m.active ? "Aktif" : "Nonaktif"}
                              </span>
                              {m.sourceFileId && (
                                <span
                                  className={`badge ${m.data.sourceVerification === "PENDING" ? "amber" : "neutral"}`}
                                >
                                  {m.data.sourceVerification === "PENDING"
                                    ? "Perlu verifikasi"
                                    : "Data sumber"}
                                </span>
                              )}
                            </td>
                            <td>
                              {canEditMasterKind(m.kind) && (
                                <button
                                  className="text-link"
                                  onClick={() =>
                                    setMasterEditor({ kind: m.kind, record: m })
                                  }
                                >
                                  Edit <ArrowRight size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!displayMasters.length && (
                      <div className="empty">
                        Belum ada master pada kategori ini.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {[
                "sales",
                "purchase",
                "expenses",
                "cash-advance",
                "maintenance",
              ].includes(view) && (
                <div className="report-toolbar">
                  <Button
                    variant="outline"
                    onClick={() => navigate("payments")}
                  >
                    <Wallet size={15} /> Pembayaran & penyelesaian
                  </Button>
                </div>
              )}
              {view === "attendances" && (
                <div className="report-toolbar">
                  <Button variant="outline" onClick={() => navigate("shifts")}>
                    Jadwal sif personel
                  </Button>
                </div>
              )}
              {view === "pos" && (
                <div className="report-toolbar">
                  <Button
                    variant="outline"
                    onClick={() => navigate("pos-close")}
                  >
                    Tutup sif kasir
                  </Button>
                  <Button variant="outline" onClick={() => navigate("barcode")}>
                    Pindai produk
                  </Button>
                </div>
              )}
              {def && (def.fields.length > 0 || def.lines) && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Register {def.name}</h2>
                      <p>Persetujuan dan posting dicatat dalam jejak audit.</p>
                    </div>
                    <form
                      className="search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setPage(0);
                        void load(company, view, branch, 0, query);
                      }}
                    >
                      <Search size={15} />
                      <input
                        placeholder="Cari dokumen…"
                        aria-label="Cari dokumen"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button type="submit">Cari</button>
                    </form>
                  </div>
                  {table(state.records)}
                  <Pagination
                    page={page}
                    total={state.total}
                    onChange={(p) => {
                      setPage(p);
                      void load(company, view, branch, p, query);
                    }}
                  />
                </section>
              )}
              {view === "dashboards" && <Insights state={state} />}
              {view === "inventory" && (
                <section className="panel stock-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Saldo stok per lot</h2>
                      <p>
                        Kuantitas tersedia, kedaluwarsa, dan status karantina
                        per lokasi.
                      </p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => navigate("barcode")}
                    >
                      Buka pemindai <ScanLine size={15} />
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Produk</th>
                          <th>Lokasi</th>
                          <th>Lot</th>
                          <th>Kedaluwarsa</th>
                          <th className="num">Stok</th>
                          <th className="num">Nilai</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.stock.map((l) => (
                          <tr key={l.id}>
                            <td>
                              {masters.find((m) => m.id === l.productId)
                                ?.name ?? l.productId}
                            </td>
                            <td>
                              {masters.find((m) => m.id === l.warehouseId)
                                ?.name ?? l.warehouseId}
                            </td>
                            <td>
                              <strong>{l.lotCode}</strong>
                              <span className="cell-sub">{l.id}</span>
                            </td>
                            <td>
                              {l.expiresAt
                                ? formatDate(l.expiresAt)
                                : "Tidak dilacak"}
                            </td>
                            <td className="num">{l.quantity}</td>
                            <td className="num">{money(l.value)}</td>
                            <td>
                              <span
                                className={`badge ${l.quarantined ? "red" : l.expiresAt && l.expiresAt.slice(0, 10) < new Date().toISOString().slice(0, 10) ? "amber" : "green"}`}
                              >
                                {l.quarantined
                                  ? "Karantina"
                                  : l.expiresAt &&
                                      l.expiresAt.slice(0, 10) <
                                        new Date().toISOString().slice(0, 10)
                                    ? "Kedaluwarsa"
                                    : "Tersedia"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!state.stock.length && (
                      <div className="empty">
                        Belum ada stok yang sudah diposting. Daftar barang impor
                        tidak otomatis menjadi saldo stok.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {view === "barcode" && (
                <BarcodeWorkspace
                  state={state}
                  onHandover={(assetId) =>
                    setRecordEditor({
                      module: "asset-handover",
                      initialData: { assetId },
                    })
                  }
                />
              )}
              {view === "discuss" && (
                <section className="panel discussion-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Komunikasi internal</h2>
                      <p>
                        Percakapan dan notifikasi terpisah per
                        perusahaan/cabang.
                      </p>
                    </div>
                    <select
                      aria-label="Channel"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                    >
                      <option value="umum"># umum</option>
                      <option value="notifikasi"># notifikasi</option>
                      <option value="operasional"># operasional</option>
                      <option value="finance"># finance</option>
                    </select>
                  </div>
                  <div className="messages">
                    {state.messages
                      .filter((m) => m.channel === channel)
                      .map((m) => (
                        <article
                          className={
                            m.system ? "message system-message" : "message"
                          }
                          key={m.id}
                        >
                          <div className="avatar">
                            {m.system
                              ? "S"
                              : m.authorName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong>{m.authorName}</strong>
                            <small>
                              {new Date(m.createdAt).toLocaleString("id-ID", {
                                timeZone: "Asia/Jakarta",
                              })}{" "}
                              WIB
                            </small>
                            <p>{m.body}</p>
                          </div>
                        </article>
                      ))}
                    {!state.messages.some((m) => m.channel === channel) && (
                      <div className="empty">Belum ada pesan di kanal ini.</div>
                    )}
                  </div>
                  <form
                    className="message-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await act("message", {
                          body: message,
                          channel,
                          branchId: branch || null,
                        });
                        setMessage("");
                        await load();
                      } catch {}
                    }}
                  >
                    <input
                      required
                      maxLength={4000}
                      aria-label="Tulis pesan"
                      placeholder="Tulis pesan internal…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <Button disabled={busy || channel === "notifikasi"}>
                      <Send size={16} /> Kirim
                    </Button>
                  </form>
                </section>
              )}
              {view === "apps" && (
                <div className="app-grid">
                  {state.modules.map((m) => {
                    const Icon = icons[m.icon] ?? Boxes;
                    return (
                      <article className="panel module-card" key={m.key}>
                        <div className={`app-icon ${m.color}`}>
                          <Icon size={24} />
                        </div>
                        <div className="module-title">
                          <h3>{m.name}</h3>
                          <span
                            className={`badge ${m.enabled ? "green" : "neutral"}`}
                          >
                            {m.enabled ? "Aktif" : "Nonaktif"}
                          </span>
                        </div>
                        <p>{m.subtitle}</p>
                        {m.dependencies && (
                          <small>Memerlukan {m.dependencies.join(", ")}</small>
                        )}
                        {m.integration && (
                          <div className="integration-note">
                            <AlertCircle size={14} />
                            <span>{m.integration}</span>
                          </div>
                        )}
                        {state.role === "ADMIN" &&
                          ![
                            "apps",
                            "settings",
                            "accounting",
                            "discuss",
                          ].includes(m.key) && (
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  await act("settings", {
                                    action: "module",
                                    companyId: company,
                                    data: { key: m.key, enabled: !m.enabled },
                                  });
                                  await load();
                                } catch {}
                              }}
                            >
                              {m.enabled ? "Nonaktifkan" : "Aktifkan"} modul
                            </Button>
                          )}
                      </article>
                    );
                  })}
                </div>
              )}
              {masterInfo&&<Modal title={masterInfo.name} onClose={()=>setMasterInfo(null)}><div className="source-detail"><p>{masterInfo.kind} ? {masterInfo.code} ? {masterInfo.active?'Aktif':'Nonaktif'}</p><DataDetails data={masterInfo.data} resolve={id=>state.masters.find(m=>m.id===id)?.name} files={Object.fromEntries(state.masterFiles?.map(f=>[f.id,f.name])??[])}/></div></Modal>}
              {view === "settings" && (
                <SettingsWorkspace
                  state={state}
                  onSubmit={async (data) => {
                    await act("settings", data);
                    await load();
                  }}
                  onPassword={async (data) => {
                    await act("password", data);
                    setLogin(true);
                  }}
                />
              )}
              {(view === "imports" || view === "sources") && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {view === "imports"
                          ? "Baris sumber & tindak lanjut"
                          : "Berkas yang terindeks"}
                      </h2>
                      <p>
                        {view === "imports"
                          ? "Baris belum terverifikasi tidak memengaruhi jurnal atau stok."
                          : "Tautan membuka berkas asli dengan hak akses Google Drive Anda."}
                      </p>
                    </div>
                    <form
                      className="search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setPage(0);
                        void load(company, view, branch, 0, query);
                      }}
                    >
                      <Search size={15} />
                      <input
                        placeholder="Cari berkas…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Cari sumber"
                      />
                      <button>Cari</button>
                    </form>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {view === "imports" ? (
                            <>
                              <th>Sumber / baris</th>
                              <th>Jenis</th>
                              <th>Status</th>
                              <th>Catatan verifikasi</th>
                              <th>Aksi</th>
                            </>
                          ) : (
                            <>
                              <th>Berkas</th>
                              <th>Status</th>
                              <th>Baris diolah</th>
                              <th>Catatan</th>
                              <th />
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {view === "imports"
                          ? importRows.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  <strong>{row.sheet}</strong>
                                  <span className="cell-sub">
                                    Baris {row.row} · {row.sourceFileId}
                                  </span>
                                </td>
                                <td>{row.kind}</td>
                                <td>
                                  <span
                                    className={`badge ${row.status === "VERIFIED" ? "green" : "amber"}`}
                                  >
                                    {row.status}
                                  </span>
                                </td>
                                <td className="wrap-cell">{row.issue}</td>
                                <td>
                                  <div className="actions">
                                    {row.targetId && (
                                      <button
                                        className="text-link"
                                        onClick={async () => {
                                          if (row.kind === "ACCOUNT") {
                                            location.assign(
                                              `/accounting?company=${company}`,
                                            );
                                          } else if (
                                            row.kind === "EMPLOYEE" ||
                                            Object.keys(
                                              masterDefinitions,
                                            ).includes(row.kind)
                                          ) {
                                            const m = masters.find(
                                              (m) => m.id === row.targetId,
                                            );
                                            if (m)
                                              setMasterEditor({
                                                kind: m.kind,
                                                record: m,
                                              });
                                            else
                                              setError(
                                                "Master tidak ada pada cakupan cabang ini.",
                                              );
                                          } else {
                                            try {
                                              const res = await fetch(
                                                `/api/operations?company=${company}&view=record&id=${row.targetId}`,
                                              );
                                              const body = await res.json();
                                              if (!res.ok)
                                                throw new Error(body.error);
                                              setRecordEditor({
                                                module: body.record.module,
                                                record: body.record,
                                              });
                                            } catch (e) {
                                              setError(
                                                e instanceof Error
                                                  ? e.message
                                                  : "Tidak dapat membuka dokumen",
                                              );
                                            }
                                          }
                                        }}
                                      >
                                        Buka & lengkapi
                                      </button>
                                    )}
                                    {canManage && row.status === "REVIEW" && (
                                      <button
                                        className="text-link"
                                        onClick={async () => {
                                          const reason = prompt(
                                            "Alasan baris ditolak",
                                          );
                                          if (!reason) return;
                                          try {
                                            await act("reviewImport", {
                                              id: row.id,
                                              decision: "REJECT",
                                              reason,
                                            });
                                            await load();
                                          } catch {}
                                        }}
                                      >
                                        Tolak
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          : sourceFiles.map((file) => (
                              <tr key={file.id}>
                                <td>
                                  <strong>{file.name}</strong>
                                  <span className="cell-sub" title={file.path}>
                                    {file.path}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${file.status === "PARSED" ? "green" : "neutral"}`}
                                  >
                                    {file.status}
                                  </span>
                                </td>
                                <td>{file.rowCount}</td>
                                <td className="wrap-cell">{file.notes}</td>
                                <td>
                                  {file.status !== "RESTRICTED" && Boolean(file.url) && (
                                    <a
                                      className="text-link"
                                      target="_blank"
                                      rel="noreferrer"
                                      href={file.url}
                                    >
                                      Drive <ExternalLink size={13} />
                                    </a>
                                  )}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={page}
                    total={listTotal}
                    onChange={(p) => {
                      setPage(p);
                      void load(company, view, branch, p, query);
                    }}
                  />
                </section>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              © 2026 Kunci Group ·{" "}
              {state?.company.isDemo
                ? "Lingkungan simulasi"
                : "Data perusahaan terautentikasi"}
            </span>
            <span>
              {loading ? "Memperbarui…" : "Workspace tersinkron"}{" "}
              <span className="dot" /> IDR · WIB
            </span>
          </footer>
        </main>
      </div>
      {recordEditor && state && (
        <RecordEditor
          {...recordEditor}
          companyId={company}
          branchId={branch}
          branches={state.branches}
          masters={masters}
          onClose={() => setRecordEditor(null)}
          onSubmit={async (d) => {
            await act("record", d);
            await load();
          }}
        />
      )}
      {masterEditor && state && (
        <MasterEditor
          {...masterEditor}
          companyId={company}
          branches={state.branches}
          masters={masters}
          onClose={() => setMasterEditor(null)}
          onSubmit={async (d) => {
            await act("master", d);
            await load();
          }}
        />
      )}
      {detail && state && (
        <Modal title={detail.number} onClose={() => setDetail(null)}>
          <div className="document-detail">
            <div className="document-title">
              <div>
                <h2>{detail.title}</h2>
                <p>
                  {formatDate(detail.date)} ·{" "}
                  {definitions.find((m) => m.key === detail.module)?.name}
                </p>
              </div>
              <span
                className={`badge ${detail.status === "POSTED" ? "green" : "amber"}`}
              >
                {labels[detail.status]}
              </span>
            </div>
            <div className="detail-kpis">
              <div>
                <span>Nilai dokumen</span>
                <strong>{money(detail.amount)}</strong>
              </div>
              <div>
                <span>Sudah diselesaikan</span>
                <strong>{money(detail.settled)}</strong>
              </div>
              <div>
                <span>Sisa</span>
                <strong>
                  {money(Number(detail.amount) - Number(detail.settled))}
                </strong>
              </div>
            </div>
            {(opsRequired(detail.module) ||
              Boolean(detail.data?.approvedName) ||
              Boolean(detail.data?.quotaOverride)) && (
              <p className="muted">
                {opsRequired(detail.module) &&
                  (detail.data?.opsVerifiedName
                    ? `Diverifikasi OPS: ${String(detail.data.opsVerifiedName)}. `
                    : detail.status === "SUBMITTED"
                      ? "Menunggu verifikasi OPS. "
                      : "")}
                {detail.data?.approvedName
                  ? `Disetujui: ${String(detail.data.approvedName)}${detail.data.approvalTier ? ` (tingkat ${String(detail.data.approvalTier)})` : ""}. `
                  : ""}
                {detail.data?.quotaOverride
                  ? "Override kuota proyek tercatat di jejak audit."
                  : ""}
              </p>
            )}
            <dl className="detail-fields">
              {Object.entries(detail.data).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {definitions
                      .find((m) => m.key === detail.module)
                      ?.fields.find((f) => f.key === key)?.label ?? key}
                  </dt>
                  <dd>
                    {masters.find((m) => m.id === value)?.name ??
                      (typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "—"))}
                  </dd>
                </div>
              ))}
            </dl>
            {detail.lines.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Uraian</th>
                      <th className="num">Kuantitas</th>
                      <th className="num">Harga</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{money(l.unitPrice)}</td>
                        <td className="num">{money(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detail.sourceFileId && (
              <div className="note">
                <FileInput size={15} /> Sumber Drive {detail.sourceFileId} ·{" "}
                {detail.sourceRow}
              </div>
            )}
            <a
              className="button button-outline"
              href={`/api/documents?company=${company}&id=${detail.id}`}
            >
              <Download size={14} /> Unduh dokumen PDF
            </a>
            {Boolean(detail.data.attachmentId) && (
              <a
                className="button button-outline"
                href={`/api/files?id=${encodeURIComponent(String(detail.data.attachmentId))}`}
              >
                <Download size={14} /> Unduh bukti
              </a>
            )}
          </div>
          <div className="panel-footer">
            {editable &&
              ["DRAFT", "IMPORTED", "REJECTED"].includes(detail.status) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRecordEditor({ module: detail.module, record: detail });
                    setDetail(null);
                  }}
                >
                  Edit / verifikasi
                </Button>
              )}
            {editable && detail.status === "DRAFT" && (
              <Button
                disabled={busy}
                onClick={() => void transition(detail, "submit")}
              >
                Ajukan persetujuan
              </Button>
            )}
            {detail.status === "SUBMITTED" &&
              opsRequired(detail.module) &&
              !(detail.data as Record<string, unknown>)?.opsVerifiedBy &&
              ["ADMIN", "DIRECTOR", "MANAGER", "SUPERVISOR"].includes(
                String(state?.assignedRole ?? state?.role),
              ) && (
                <Button
                  disabled={busy}
                  onClick={() => void transition(detail, "verify")}
                >
                  Verifikasi OPS
                </Button>
              )}
            {canManage && detail.status === "SUBMITTED" && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void transition(detail, "reject")}
                >
                  Tolak
                </Button>
                <Button
                  disabled={
                    busy ||
                    (opsRequired(detail.module) &&
                      !(detail.data as Record<string, unknown>)?.opsVerifiedBy)
                  }
                  title={
                    opsRequired(detail.module) &&
                    !(detail.data as Record<string, unknown>)?.opsVerifiedBy
                      ? "Menunggu verifikasi OPS"
                      : undefined
                  }
                  onClick={() => void transition(detail, "approve")}
                >
                  Setujui
                </Button>
              </>
            )}
            {canManage && detail.status === "APPROVED" && (
              <Button
                disabled={
                  busy ||
                  (financialModules.has(detail.module) &&
                    !["ADMIN", "FINANCE"].includes(state.role))
                }
                onClick={() => void transition(detail, "post")}
              >
                <Check size={15} /> Post / finalisasi
              </Button>
            )}
            {editable &&
              ["DRAFT", "IMPORTED", "REJECTED"].includes(detail.status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void transition(detail, "cancel")}
                >
                  Batalkan
                </Button>
              )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total.toLocaleString("id-ID")} data · halaman {page + 1} dari{" "}
        {Math.max(1, Math.ceil(total / 50))}
      </span>
      <div className="actions">
        <button
          disabled={page === 0}
          className="icon-button"
          aria-label="Halaman sebelumnya"
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          disabled={(page + 1) * 50 >= total}
          className="icon-button"
          aria-label="Halaman berikutnya"
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function Insights({ state }: { state: AppState }) {
  return (
    <div className="settings-stack">
      {state.insights.financial && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Laba rugi per cabang · {state.insights.ledgerMonth ?? state.insights.month}
              </h2>
              <p>
                Pendapatan dan beban dari buku besar yang diposting, tanpa
                jurnal penutup dan saldo awal. Penjualan ditampilkan sebelum PPN.
                {state.insights.ledgerBasis === "BULAN_TERAKHIR_TERSEDIA" &&
                  ` Bulan berjalan (${state.insights.month}) belum memiliki jurnal; ditampilkan bulan terakhir yang telah dibukukan.`}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cabang</th>
                  <th className="num">Pendapatan</th>
                  <th className="num">Beban termasuk HPP</th>
                  <th className="num">Laba / rugi</th>
                </tr>
              </thead>
              <tbody>
                {state.insights.branches.map((v) => (
                  <tr key={v.branchId ?? "HO"}>
                    <td>
                      {state.branches.find((b) => b.id === v.branchId)?.name ??
                        "Perusahaan / tanpa cabang"}
                    </td>
                    <td className="num">{money(v.revenue)}</td>
                    <td className="num">{money(v.expense)}</td>
                    <td className="num">{money(v.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!state.insights.branches.length && (
              <div className="empty">
                Belum ada jurnal pada bulan ini. Saldo sumber yang belum
                diverifikasi belum tercakup.
              </div>
            )}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Penyelesaian WO per proyek · {state.insights.month}</h2>
            <p>
              Ketepatan waktu memakai tanggal penyelesaian aktual dan target WO.
              Sasaran SLA ditetapkan pada master proyek.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Proyek</th>
                <th>WO</th>
                <th>Selesai</th>
                <th>Tepat waktu</th>
                <th>Tingkat pemenuhan</th>
              </tr>
            </thead>
            <tbody>
              {state.insights.projects.map((v) => (
                <tr key={v.projectId}>
                  <td>
                    {state.masters.find((m) => m.id === v.projectId)?.name ??
                      v.projectId}
                  </td>
                  <td>{v.total}</td>
                  <td>{v.completed}</td>
                  <td>{v.onTime}</td>
                  <td>{v.onTimePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!state.insights.projects.length && (
            <div className="empty">Belum ada WO pada bulan ini.</div>
          )}
        </div>
      </section>
    </div>
  );
}
