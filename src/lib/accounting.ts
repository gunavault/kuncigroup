import { Prisma, EntryType } from "@prisma/client";
import { db } from "./db";
import {
  amount,
  cents,
  signedCents,
  validateLines,
  type InputLine,
} from "./money";
import { journalSchema, accountSchema } from "./validation";
import { object, str } from "./operations/shared";
type Tx = Prisma.TransactionClient;
const include = {
  lines: { include: { account: true } },
  attachment: true,
} as const;
async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 20000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          (e.code === "P2010" &&
            ["40001", "40P01"].includes(String(e.meta?.code)))) &&
        i < 3
      )
        continue;
      throw e;
    }
  }
  throw new Error("Transaksi bersamaan gagal; silakan ulangi.");
}
async function openPeriod(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM fiscal_periods WHERE id=${id} FOR UPDATE`;
  const p = await tx.fiscalPeriod.findUniqueOrThrow({ where: { id } });
  if (p.status !== "OPEN") throw new Error("Periode sudah ditutup.");
  return p;
}
export async function insert(
  tx: Tx,
  pid: string,
  date: Date,
  type: EntryType,
  description: string,
  lines: InputLine[],
  extra: {
    attachmentId?: string;
    cashActivity?: "OPERATING" | "INVESTING" | "FINANCING";
    reversalOfId?: string;
    status?: "DRAFT" | "POSTED";
    branchId?: string;
    actorId?: string;
  } = {},
) {
  validateLines(lines);
  const p = await openPeriod(tx, pid);
  if (Number.isNaN(date.getTime()) || date < p.startDate || date > p.endDate)
    throw new Error("Tanggal di luar periode fiskal.");
  const accounts = await tx.account.findMany({
    where: { id: { in: lines.map((l) => l.accountId) }, active: true },
  });
  if (lines.some((l) => !accounts.find((a) => a.id === l.accountId)))
    throw new Error("Akun tidak ditemukan atau tidak aktif.");
  if (
    !["CLOSING"].includes(type) &&
    accounts.some((a) => a.role === "INCOME_SUMMARY")
  )
    throw new Error("Ikhtisar laba rugi hanya untuk jurnal penutup.");
  if (
    type === "OPENING" &&
    (await tx.journalEntry.count({
      where: { fiscalPeriodId: pid, type: "OPENING" },
    }))
  )
    throw new Error(
      "Saldo awal periode sudah tersedia. Gunakan jurnal penyesuaian.",
    );
  if (
    accounts.some((a) => a.isCash) &&
    type !== "OPENING" &&
    !extra.cashActivity
  )
    throw new Error("Pilih aktivitas arus kas untuk transaksi kas.");
  const period = await tx.fiscalPeriod.update({
    where: { id: pid },
    data: { sequence: { increment: 1 } },
  });
  const prefix = {
    OPENING: "SA",
    GENERAL: "JU",
    ADJUSTING: "JP",
    CLOSING: "JT",
    REVERSING: "JB",
  }[type];
  const entry = await tx.journalEntry.create({
    data: {
      fiscalPeriodId: pid,
      companyId: p.companyId,
      transactionDate: date,
      type,
      description,
      ...extra,
      status: "DRAFT",
      journalNumber: `${prefix}-${p.companyId === "DEMO" ? "" : p.companyId + "-"}${p.startDate.toISOString().slice(0, 7).replace("-", "")}-${String(period.sequence).padStart(4, "0")}`,
      lines: {
        create: lines.map((l) => ({ ...l, description: l.description ?? "" })),
      },
    },
    include,
  });
  await tx.auditEvent.create({
    data: {
      action: "JOURNAL_CREATED",
      companyId: p.companyId,
      actorId: extra.actorId,
      entityId: entry.id,
      details: {
        number: entry.journalNumber,
        type,
        status: extra.status ?? "POSTED",
      },
    },
  });
  if (extra.status !== "DRAFT")
    return tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: "POSTED" },
      include,
    });
  return entry;
}
export async function createJournal(input: unknown, actorId?: string) {
  const v = journalSchema.parse(input);
  return atomic((tx) =>
    insert(
      tx,
      v.periodId,
      new Date(`${v.date}T00:00:00Z`),
      v.type,
      v.description,
      v.lines,
      {
        actorId,
        status: v.status,
        attachmentId: v.attachmentId,
        cashActivity: v.cashActivity,
      },
    ),
  );
}
export async function postDraft(id: string, actorId?: string) {
  return atomic(async (tx) => {
    const e = await tx.journalEntry.findUniqueOrThrow({
      where: { id },
      include,
    });
    await openPeriod(tx, e.fiscalPeriodId);
    if (e.status !== "DRAFT") throw new Error("Jurnal sudah posted.");
    validateLines(
      e.lines.map((l) => ({
        ...l,
        debit: l.debit.toString(),
        credit: l.credit.toString(),
      })),
    );
    const result = await tx.journalEntry.update({
      where: { id },
      data: { status: "POSTED" },
    });
    await tx.auditEvent.create({
      data: {
        action: "JOURNAL_POSTED",
        companyId: e.companyId,
        actorId,
        entityId: id,
        details: {},
      },
    });
    return result;
  });
}
export async function reverseJournal(
  id: string,
  periodId: string,
  date: string,
  actorId?: string,
) {
  return atomic(async (tx) => {
    const e = await tx.journalEntry.findUniqueOrThrow({
      where: { id },
      include,
    });
    if (
      e.status !== "POSTED" ||
      e.type === "CLOSING" ||
      e.type === "OPENING" ||
      e.type === "REVERSING"
    )
      throw new Error(
        "Hanya jurnal umum/penyesuaian posted yang dapat dibalik.",
      );
    return insert(
      tx,
      periodId,
      new Date(`${date}T00:00:00Z`),
      "REVERSING",
      `Pembalik ${e.journalNumber}: ${e.description}`,
      e.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.credit.toString(),
        credit: l.debit.toString(),
      })),
      { actorId, reversalOfId: id, cashActivity: e.cashActivity ?? undefined },
    );
  });
}
export async function saveAccount(input: unknown) {
  const a = accountSchema.parse(input);
  return atomic(async (tx) => {
    const current = a.id
      ? await tx.account.findUniqueOrThrow({ where: { id: a.id } })
      : null;
    if (current?.isSystemAccount)
      throw new Error("Akun sistem tidak dapat diubah.");
    if (current && (await tx.journalLine.count({ where: { accountId: a.id } })))
      throw new Error("Akun yang sudah dipakai tidak dapat diubah.");
    if (a.isCash && a.category !== "ASET")
      throw new Error("Akun kas harus kategori aset.");
    const { id, ...data } = a;
    const values = {
      ...data,
      normalBalance: ((a.category === "ASET" || a.category === "BEBAN") !==
      a.isContra
        ? "DEBIT"
        : "KREDIT") as "DEBIT" | "KREDIT",
    };
    const result = id
      ? await tx.account.update({ where: { id }, data: values })
      : await tx.account.create({ data: values });
    await tx.auditEvent.create({
      data: {
        action: id ? "ACCOUNT_UPDATED" : "ACCOUNT_CREATED",
        entityId: result.id,
        details: { code: a.code },
      },
    });
    return result;
  });
}
export async function deleteAccount(id: string) {
  return atomic(async (tx) => {
    const a = await tx.account.findUniqueOrThrow({ where: { id } });
    if (
      a.isSystemAccount ||
      (await tx.journalLine.count({ where: { accountId: id } }))
    )
      throw new Error(
        "Akun sistem atau yang sudah dipakai tidak dapat dihapus.",
      );
    await tx.account.delete({ where: { id } });
    await tx.auditEvent.create({
      data: {
        action: "ACCOUNT_DELETED",
        entityId: id,
        details: { code: a.code },
      },
    });
  });
}
export async function reports(tx: Tx, pid: string) {
  const [accounts, entries] = await Promise.all([
    tx.account.findMany({ orderBy: { code: "asc" } }),
    tx.journalEntry.findMany({
      where: {
        fiscalPeriodId: pid,
        status: "POSTED",
        type: { not: "CLOSING" },
      },
      include,
      orderBy: [{ transactionDate: "asc" }, { journalNumber: "asc" }],
    }),
  ]);
  const rows = accounts.map((a) => {
    let before = 0n,
      adjustment = 0n;
    for (const e of entries)
      for (const l of e.lines.filter((l) => l.accountId === a.id)) {
        const v = cents(l.debit) - cents(l.credit);
        if (e.type === "ADJUSTING") adjustment += v;
        else before += v;
      }
    const total = before + adjustment;
    return {
      ...a,
      before: amount(before),
      adjustment: amount(adjustment),
      net: amount(total),
      balance: amount(a.normalBalance === "DEBIT" ? total : -total),
      debit: amount(total > 0n ? total : 0n),
      credit: amount(total < 0n ? -total : 0n),
    };
  });
  const period = await tx.fiscalPeriod.findUniqueOrThrow({
    where: { id: pid },
  });
  const company = await tx.company.findUnique({
    where: { id: period.companyId },
  });
  const config = object(object(company?.settings).accounting);
  const drawingIds = Array.isArray(config.drawingsIds)
    ? config.drawingsIds.map(String)
    : [];
  const isDrawing = (r: (typeof rows)[number]) =>
    r.role === "DRAWINGS" || drawingIds.includes(r.id);
  const sum = (cat: string) =>
    rows
      .filter((r) => r.category === cat)
      .reduce(
        (s, r) =>
          s +
          signedCents(r.net) * (cat === "ASET" || cat === "BEBAN" ? 1n : -1n),
        0n,
      );
  const revenue = sum("PENDAPATAN"),
    expense = sum("BEBAN"),
    profit = revenue - expense,
    assets = sum("ASET"),
    liabilities = sum("KEWAJIBAN");
  const drawings = rows
    .filter(isDrawing)
    .reduce((s, r) => s + signedCents(r.net), 0n);
  const capitalBefore = rows
    .filter((r) => r.category === "EKUITAS" && !isDrawing(r))
    .reduce((s, r) => s - signedCents(r.net), 0n);
  const equity = capitalBefore + profit - drawings;
  const cash = { OPERATING: 0n, INVESTING: 0n, FINANCING: 0n };
  let openingCash = 0n;
  for (const e of entries)
    for (const l of e.lines.filter((l) => l.account.isCash)) {
      const value = cents(l.debit) - cents(l.credit);
      if (e.type === "OPENING") openingCash += value;
      else if (e.cashActivity) cash[e.cashActivity] += value;
    }
  const cashEnd = rows
    .filter((r) => r.isCash)
    .reduce((s, r) => s + signedCents(r.net), 0n);
  const ar = rows.find(
    (r) =>
      r.id === config.receivable || (!config.receivable && r.code === "112"),
  );
  const ap = rows.find(
    (r) => r.id === config.payable || (!config.payable && r.code === "211"),
  );
  return {
    rows,
    entries,
    receivables: ar ? ar.net : "0.00",
    payables: ap ? amount(-signedCents(ap.net)) : "0.00",
    revenue: amount(revenue),
    expense: amount(expense),
    profit: amount(profit),
    assets: amount(assets),
    liabilities: amount(liabilities),
    capitalBefore: amount(capitalBefore),
    drawings: amount(drawings),
    equity: amount(equity),
    balanceDifference: amount(assets - liabilities - equity),
    trialDebit: amount(rows.reduce((s, r) => s + cents(r.debit), 0n)),
    trialCredit: amount(rows.reduce((s, r) => s + cents(r.credit), 0n)),
    cash: {
      opening: amount(openingCash),
      operating: amount(cash.OPERATING),
      investing: amount(cash.INVESTING),
      financing: amount(cash.FINANCING),
      ending: amount(cashEnd),
      difference: amount(
        cashEnd -
          openingCash -
          cash.OPERATING -
          cash.INVESTING -
          cash.FINANCING,
      ),
    },
  };
}
async function closingPlan(tx: Tx, pid: string) {
  const r = await reports(tx, pid);
  const period = await tx.fiscalPeriod.findUniqueOrThrow({
    where: { id: pid },
  });
  const company = await tx.company.findUnique({
    where: { id: period.companyId },
  });
  const config = object(object(company?.settings).accounting);
  const summary = await tx.account.findUniqueOrThrow({
    where: config.summaryId
      ? { id: str(config.summaryId) }
      : { role: "INCOME_SUMMARY" },
  });
  const capital = await tx.account.findUniqueOrThrow({
    where: config.capitalId
      ? { id: str(config.capitalId) }
      : { role: "CAPITAL" },
  });
  const groups: { description: string; lines: InputLine[] }[] = [];
  for (const [category, label] of [
    ["PENDAPATAN", "Menutup pendapatan"],
    ["BEBAN", "Menutup beban"],
  ] as const) {
    const lines: InputLine[] = r.rows
      .filter((a) => a.category === category && signedCents(a.net) !== 0n)
      .map((a) => {
        const n = signedCents(a.net);
        return {
          accountId: a.id,
          debit: amount(n < 0n ? -n : 0n),
          credit: amount(n > 0n ? n : 0n),
        };
      });
    const delta = lines.reduce(
      (s, l) => s + cents(l.debit) - cents(l.credit),
      0n,
    );
    if (lines.length) {
      lines.push({
        accountId: summary.id,
        debit: amount(delta < 0n ? -delta : 0n),
        credit: amount(delta > 0n ? delta : 0n),
      });
      if (delta === 0n) lines.pop();
      if (lines.length >= 2) groups.push({ description: label, lines });
    }
  }
  const profit = signedCents(r.profit);
  if (profit !== 0n)
    groups.push({
      description: "Memindahkan laba/rugi ke modal",
      lines: [
        {
          accountId: summary.id,
          debit: amount(profit > 0n ? profit : 0n),
          credit: amount(profit < 0n ? -profit : 0n),
        },
        {
          accountId: capital.id,
          debit: amount(profit < 0n ? -profit : 0n),
          credit: amount(profit > 0n ? profit : 0n),
        },
      ],
    });
  for (const drawings of r.rows.filter(
    (a) =>
      a.role === "DRAWINGS" ||
      (Array.isArray(config.drawingsIds) && config.drawingsIds.includes(a.id)),
  )) {
    const dn = signedCents(drawings.net);
    if (dn !== 0n)
      groups.push({
        description: "Menutup prive/dividen ke modal",
        lines: [
          {
            accountId: capital.id,
            debit: amount(dn > 0n ? dn : 0n),
            credit: amount(dn < 0n ? -dn : 0n),
          },
          {
            accountId: drawings.id,
            debit: amount(dn < 0n ? -dn : 0n),
            credit: amount(dn > 0n ? dn : 0n),
          },
        ],
      });
  }
  return { report: r, groups };
}
export async function previewClosing(pid: string) {
  return db.$transaction((tx) => closingPlan(tx, pid), {
    isolationLevel: "RepeatableRead",
  });
}
export async function closePeriod(pid: string, actorId?: string) {
  return atomic(async (tx) => {
    const p = await openPeriod(tx, pid);
    if (
      await tx.journalEntry.count({
        where: { fiscalPeriodId: pid, status: "DRAFT" },
      })
    )
      throw new Error("Posting seluruh draft sebelum tutup buku.");
    if (
      await tx.businessRecord.count({
        where: {
          companyId: p.companyId,
          date: { gte: p.startDate, lte: p.endDate },
          status: { in: ["IMPORTED", "DRAFT", "SUBMITTED", "APPROVED"] },
        },
      })
    )
      throw new Error(
        "Masih ada dokumen operasional pada periode ini yang belum diverifikasi/difinalisasi.",
      );
    const { groups } = await closingPlan(tx, pid);
    for (const g of groups)
      await insert(tx, pid, p.endDate, "CLOSING", g.description, g.lines);
    const all = await tx.journalLine.findMany({
      where: { entry: { fiscalPeriodId: pid, status: "POSTED" } },
      include: { account: true },
    });
    const balances = new Map<string, bigint>();
    for (const l of all)
      balances.set(
        l.accountId,
        (balances.get(l.accountId) ?? 0n) + cents(l.debit) - cents(l.credit),
      );
    const lines: InputLine[] = [];
    for (const [accountId, n] of balances)
      if (n !== 0n)
        lines.push({
          accountId,
          debit: amount(n > 0n ? n : 0n),
          credit: amount(n < 0n ? -n : 0n),
        });
    const start = new Date(p.endDate);
    start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
    if (
      await tx.fiscalPeriod.count({
        where: {
          companyId: p.companyId,
          startDate: { lte: end },
          endDate: { gte: start },
        },
      })
    )
      throw new Error("Periode berikutnya sudah ada atau bertumpang tindih.");
    const next = await tx.fiscalPeriod.create({
      data: {
        companyId: p.companyId,
        name: new Intl.DateTimeFormat("id-ID", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(start),
        startDate: start,
        endDate: end,
      },
    });
    if (lines.length)
      await insert(
        tx,
        next.id,
        start,
        "OPENING",
        `Saldo awal dari ${p.name}`,
        lines,
      );
    await tx.fiscalPeriod.update({
      where: { id: pid },
      data: { status: "CLOSED" },
    });
    await tx.auditEvent.create({
      data: {
        action: "PERIOD_CLOSED",
        companyId: p.companyId,
        actorId,
        entityId: pid,
        details: { nextPeriodId: next.id, closingEntries: groups.length },
      },
    });
    return next;
  });
}
export async function snapshot(pid?: string, companyId = "DEMO") {
  return db.$transaction(
    async (tx) => {
      const periods = await tx.fiscalPeriod.findMany({
        where: { companyId },
        orderBy: { startDate: "desc" },
      });
      const period = periods.find((p) => p.id === pid) ?? periods[0];
      if (!period) throw new Error("Jalankan seed database terlebih dahulu.");
      const r = await reports(tx, period.id);
      const journals = await tx.journalEntry.findMany({
        where: { fiscalPeriodId: period.id },
        include,
        orderBy: [{ transactionDate: "desc" }, { journalNumber: "desc" }],
      });
      const audit = await tx.auditEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
      });
      return { company, periods, period, report: r, journals, audit };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
