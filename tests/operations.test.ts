import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
const schema = `ops_${randomUUID().replaceAll("-", "")}`,
  url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
await client.query(`CREATE SCHEMA "${schema}"`);
await client.query(`SET search_path TO "${schema}"`);
for (const d of readdirSync("prisma/migrations").filter((d) => /^\d/.test(d)))
  await client.query(
    readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  );
const { db } = await import("../src/lib/db");
const { saveMaster, saveRecord, transitionRecord } = await import(
  "../src/lib/operations/engine"
);
const { operationSnapshot } = await import("../src/lib/operations/read");
const { manageSettings } = await import("../src/lib/operations/settings");
const auth = await import("../src/lib/auth");
const { snapshot, closePeriod } = await import("../src/lib/accounting");
const { object } = await import("../src/lib/operations/shared");
type Actor = import("../src/lib/auth").Actor;
const admin: Actor = {
  id: "owner",
  name: "Owner",
  email: "owner@example.test",
  superuser: true,
  grants: [],
  mustChangePassword: false,
};
const actor = (
  id: string,
  role: import("@prisma/client").Role,
  branches: string[] = [],
): Actor => ({
  id,
  name: id,
  email: `${id}@example.test`,
  superuser: false,
  grants: [{ companyId: "A", role, branchIds: branches }],
  mustChangePassword: false,
});
const manager = actor("manager", "MANAGER"),
  finance = actor("finance", "FINANCE"),
  staff = actor("staff", "STAFF", ["A-1"]),
  auditor = actor("auditor", "AUDITOR");
let employee: any,
  warehouse: any,
  warehouseB: any,
  product: any,
  service: any,
  asset: any,
  customer: any,
  vendor: any,
  advance: any,
  sale: any,
  bill: any;
const date = "2026-11-17";
const line = (id: string | undefined, price: string, q = "1", data = {}) => ({
  productId: id,
  description: "Test line",
  quantity: q,
  unitPrice: price,
  data,
});
async function draft(
  module: string,
  data: any = {},
  lines: any[] = [],
  who = admin,
  branchId = "A-1",
  dt = date,
) {
  return saveRecord(who, {
    companyId: "A",
    branchId,
    module,
    title: `Test ${module}`,
    date: dt,
    data,
    lines,
  });
}
async function finalize(r: any, approver = admin, poster = finance) {
  r = await transitionRecord(admin, {
    companyId: r.companyId,
    id: r.id,
    version: r.version,
    action: "submit",
  });
  r = await transitionRecord(approver, {
    companyId: r.companyId,
    id: r.id,
    version: r.version,
    action: "approve",
  });
  return transitionRecord(poster, {
    companyId: r.companyId,
    id: r.id,
    version: r.version,
    action: "post",
  });
}
async function abandon(r: any) {
  r = await db.businessRecord.findUniqueOrThrow({ where: { id: r.id } });
  if (["SUBMITTED", "APPROVED"].includes(r.status))
    r = await transitionRecord(admin, {
      companyId: r.companyId,
      id: r.id,
      version: r.version,
      action: "reject",
      reason: "Test cleanup",
    });
  if (["DRAFT", "REJECTED", "IMPORTED"].includes(r.status))
    await transitionRecord(admin, {
      companyId: r.companyId,
      id: r.id,
      version: r.version,
      action: "cancel",
    });
}
await test("Operational ERP integration", async (t) => {
  t.after(async () => {
    await db.$disconnect();
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });
  const map: Record<string, string> = {};
  const assetKeys = [
    "cash",
    "bank",
    "receivable",
    "inventory",
    "advance",
    "taxInput",
    "withholding",
  ];
  const expenseKeys = ["expense", "cogs"];
  let number = 0;
  for (const key of [
    "cash",
    "bank",
    "receivable",
    "payable",
    "revenue",
    "inventory",
    "advance",
    "expense",
    "cogs",
    "taxInput",
    "taxOutput",
    "withholding",
    "withheldPayable",
    "clearing",
    "capitalId",
    "summaryId",
  ]) {
    const category = assetKeys.includes(key)
      ? "ASET"
      : expenseKeys.includes(key)
        ? "BEBAN"
        : key === "revenue"
          ? "PENDAPATAN"
          : ["capitalId", "summaryId"].includes(key)
            ? "EKUITAS"
            : "KEWAJIBAN";
    map[key] = key;
    await db.account.create({
      data: {
        id: key,
        code: String(1000 + number++),
        name: key,
        category,
        normalBalance:
          category === "ASET" || category === "BEBAN" ? "DEBIT" : "KREDIT",
        isCash: ["cash", "bank"].includes(key),
        role:
          key === "capitalId"
            ? "CAPITAL"
            : key === "summaryId"
              ? "INCOME_SUMMARY"
              : null,
      },
    });
  }
  for (const id of ["A", "B"])
    await db.company.create({
      data: {
        id,
        code: id,
        name: `Company ${id}`,
        settings: { accounting: map },
      },
    });
  for (const id of ["A-1", "A-2", "B-1"])
    await db.branch.create({
      data: {
        id,
        companyId: id[0],
        code: id,
        name: id,
        latitude: -6.2,
        longitude: 106.8,
        radius: 200,
      },
    });
  const master = async (
    kind: string,
    code: string,
    data: any,
    name = code,
    branchId = "A-1",
  ) => saveMaster(admin, { companyId: "A", branchId, kind, code, name, data });
  employee = await master("EMPLOYEE", "EMP1", {
    position: "Operator",
    userId: "staff",
  });
  warehouse = await master("WAREHOUSE", "WH1", { type: "CENTRAL" });
  warehouseB = await master(
    "WAREHOUSE",
    "WH2",
    { type: "SITE" },
    "Warehouse 2",
    "A-2",
  );
  product = await master("PRODUCT", "SKU1", {
    type: "STOCK",
    uom: "PCS",
    trackExpiry: true,
    barcode: "10000001",
    salePrice: "200",
    cost: "100",
  });
  service = await master("PRODUCT", "SVC1", {
    type: "SERVICE",
    uom: "JOB",
    salePrice: "25",
  });
  asset = await master("ASSET", "ASSET1", {
    serial: "TEST001",
    barcode: "ASSET0001",
  });
  customer = await master("PARTNER", "CUS1", { type: "CUSTOMER" });
  vendor = await master("PARTNER", "VEN1", { type: "VENDOR" });
  await db.attachment.createMany({
    data: [
      {
        id: "receipt",
        companyId: "A",
        ownerId: "staff",
        name: "test.pdf",
        mime: "application/pdf",
        path: "test-receipt",
      },
      {
        id: "taxproof",
        companyId: "A",
        ownerId: "finance",
        name: "tax.pdf",
        mime: "application/pdf",
        path: "test-tax",
      },
    ],
  });
  await t.test(
    "RBAC rejects other companies, other branches and master edits by staff",
    async () => {
      assert.throws(() => auth.authorizeCompany(staff, "B"));
      assert.throws(() => auth.authorizeCompany(staff, "A", undefined, "A-2"));
      await assert.rejects(
        saveMaster(staff, {
          companyId: "A",
          branchId: "A-1",
          kind: "PRODUCT",
          code: "BAD",
          name: "Bad",
          data: { type: "STOCK", uom: "PCS" },
        }),
      );
      assert.equal(auth.companyRole(auditor, "A"), "AUDITOR");
    },
  );
  await t.test(
    "duplicate barcodes and cross-company product references are rejected",
    async () => {
      await assert.rejects(
        master("PRODUCT", "DUP", {
          type: "STOCK",
          uom: "PCS",
          barcode: "10000001",
        }),
      );
      const p = await saveMaster(admin, {
        companyId: "B",
        branchId: "B-1",
        kind: "PRODUCT",
        code: "B1",
        name: "Other company",
        data: { type: "STOCK", uom: "PCS" },
      });
      await assert.rejects(
        draft("sales", { partnerId: customer.id, dueDate: date }, [
          line(p.id, "100"),
        ]),
      );
    },
  );
  await t.test(
    "maker cannot approve own application; advance posts once",
    async () => {
      advance = await draft(
        "cash-advance",
        {
          employeeId: employee.id,
          dueDate: "2026-11-30",
          purpose: "Test advance",
        },
        [line(undefined, "500")],
        manager,
      );
      advance = await transitionRecord(manager, {
        companyId: "A",
        id: advance.id,
        version: advance.version,
        action: "submit",
      });
      await assert.rejects(
        transitionRecord(manager, {
          companyId: "A",
          id: advance.id,
          version: advance.version,
          action: "approve",
        }),
      );
      advance = await transitionRecord(admin, {
        companyId: "A",
        id: advance.id,
        version: advance.version,
        action: "approve",
      });
      advance = await transitionRecord(finance, {
        companyId: "A",
        id: advance.id,
        version: advance.version,
        action: "post",
      });
      assert.ok(advance.journalId);
      await assert.rejects(
        transitionRecord(finance, {
          companyId: "A",
          id: advance.id,
          version: advance.version,
          action: "post",
        }),
      );
    },
  );
  await t.test(
    "purchase receiving creates stock and payable with tax",
    async () => {
      bill = await finalize(
        await draft(
          "purchase",
          {
            partnerId: vendor.id,
            dueDate: "2026-12-01",
            warehouseId: warehouse.id,
            taxPercent: "11",
          },
          [
            line(product.id, "100", "5", {
              lotCode: "EARLY",
              expiresAt: "2026-11-20",
            }),
          ],
          admin,
          "A-1",
          "2026-11-01",
        ),
      );
      await finalize(
        await draft(
          "purchase",
          {
            partnerId: vendor.id,
            dueDate: "2026-12-01",
            warehouseId: warehouse.id,
            taxPercent: "11",
          },
          [
            line(product.id, "120", "5", {
              lotCode: "LATE",
              expiresAt: "2026-11-30",
            }),
          ],
          admin,
          "A-1",
          "2026-11-01",
        ),
      );
      assert.equal(bill.amount.toString(), "555");
      const early = await db.stockLot.findFirstOrThrow({
        where: { lotCode: "EARLY" },
      });
      assert.equal(early.quantity.toString(), "5");
      assert.equal(early.value.toString(), "500");
    },
  );
  await t.test(
    "overselling rolls back stock, journal and document status",
    async () => {
      let r = await draft(
        "sales",
        {
          partnerId: customer.id,
          dueDate: date,
          warehouseId: warehouse.id,
          taxPercent: "11",
        },
        [line(product.id, "200", "20")],
      );
      r = await transitionRecord(admin, {
        companyId: "A",
        id: r.id,
        version: r.version,
        action: "submit",
      });
      r = await transitionRecord(admin, {
        companyId: "A",
        id: r.id,
        version: r.version,
        action: "approve",
      });
      const n = await db.journalEntry.count();
      await assert.rejects(
        transitionRecord(finance, {
          companyId: "A",
          id: r.id,
          version: r.version,
          action: "post",
        }),
      );
      assert.equal(await db.journalEntry.count(), n);
      assert.equal(
        (
          await db.stockLot.aggregate({ _sum: { quantity: true } })
        )._sum.quantity?.toString(),
        "10",
      );
      await abandon(r);
    },
  );
  await t.test("sales allocates FEFO and books exact COGS", async () => {
    sale = await finalize(
      await draft(
        "sales",
        {
          partnerId: customer.id,
          dueDate: date,
          warehouseId: warehouse.id,
          taxPercent: "11",
        },
        [line(product.id, "200", "6")],
      ),
    );
    assert.equal(sale.amount.toString(), "1332");
    assert.equal(
      (
        await db.stockLot.findFirstOrThrow({ where: { lotCode: "EARLY" } })
      ).quantity.toString(),
      "0",
    );
    assert.equal(
      (
        await db.stockLot.findFirstOrThrow({ where: { lotCode: "LATE" } })
      ).value.toString(),
      "480",
    );
    const journal = await db.journalEntry.findUniqueOrThrow({
      where: { id: sale.journalId! },
      include: { lines: true },
    });
    assert.equal(
      journal.lines.find((l) => l.accountId === "cogs")?.debit.toString(),
      "620",
    );
  });
  await t.test(
    "partial receipts and withholding settle receivable without overpayment",
    async () => {
      await finalize(
        await draft("payments", {
          referenceId: sale.number,
          direction: "RECEIVE",
          amount: "1000",
        }),
      );
      await finalize(
        await draft("payments", {
          referenceId: sale.number,
          direction: "RECEIVE",
          amount: "300",
          withheldAmount: "32",
          attachmentId: "taxproof",
        }),
      );
      assert.equal(
        (
          await db.businessRecord.findUniqueOrThrow({ where: { id: sale.id } })
        ).settled.toString(),
        "1332",
      );
      const tooMuch = await draft("payments", {
        referenceId: sale.number,
        direction: "RECEIVE",
        amount: "1",
      });
      await assert.rejects(finalize(tooMuch));
      await abandon(tooMuch);
    },
  );
  await t.test(
    "supplier withholding creates tax payable and settles gross bill",
    async () => {
      await finalize(
        await draft("payments", {
          referenceId: bill.number,
          direction: "PAY",
          amount: "100",
        }),
      );
      const payment = await finalize(
        await draft("payments", {
          referenceId: bill.number,
          direction: "PAY",
          amount: "435",
          withheldAmount: "20",
          attachmentId: "taxproof",
        }),
      );
      assert.equal(
        (
          await db.businessRecord.findUniqueOrThrow({ where: { id: bill.id } })
        ).settled.toString(),
        "555",
      );
      const j = await db.journalEntry.findUniqueOrThrow({
        where: { id: payment.journalId! },
        include: { lines: true },
      });
      assert.equal(
        j.lines
          .find((l) => l.accountId === "withheldPayable")
          ?.credit.toString(),
        "20",
      );
    },
  );
  await t.test(
    "expense offsets advance and unused cash is returned",
    async () => {
      const claim = await finalize(
        await draft(
          "expenses",
          {
            employeeId: employee.id,
            advanceId: advance.number,
            attachmentId: "receipt",
          },
          [line(undefined, "350")],
          staff,
        ),
        manager,
      );
      assert.equal(claim.settled.toString(), "350");
      await finalize(
        await draft("payments", {
          referenceId: advance.number,
          direction: "ADVANCE_RETURN",
          amount: "150",
        }),
      );
      assert.equal(
        (
          await db.businessRecord.findUniqueOrThrow({
            where: { id: advance.id },
          })
        ).settled.toString(),
        "500",
      );
    },
  );
  await t.test(
    "QC failure quarantines lot; release requires corrective evidence",
    async () => {
      const lot = await db.stockLot.findFirstOrThrow({
        where: { lotCode: "LATE" },
      });
      await finalize(
        await draft("quality", {
          lotId: lot.id,
          temperature: "10",
          minimum: "0",
          maximum: "8",
          result: "FAIL",
          checklist: "Cold chain failed",
        }),
        admin,
        manager,
      );
      assert.equal(
        (await db.stockLot.findUniqueOrThrow({ where: { id: lot.id } }))
          .quarantined,
        true,
      );
      await assert.rejects(
        draft("quality", {
          lotId: lot.id,
          temperature: "10",
          minimum: "0",
          maximum: "8",
          result: "PASS",
          checklist: "Invalid pass",
        }),
      );
      const attempt = await draft(
        "sales",
        { partnerId: customer.id, dueDate: date, warehouseId: warehouse.id },
        [line(product.id, "200")],
      );
      await assert.rejects(finalize(attempt));
      await abandon(attempt);
      const pass = await draft("quality", {
        lotId: lot.id,
        temperature: "5",
        minimum: "0",
        maximum: "8",
        result: "PASS",
        checklist: "Temperature within bounds",
        correctiveAction: "Cold chain corrected and rechecked",
      });
      await finalize(pass, admin, manager);
      assert.equal(
        (await db.stockLot.findUniqueOrThrow({ where: { id: lot.id } }))
          .quarantined,
        false,
      );
    },
  );
  await t.test("expired stock cannot be issued", async () => {
    const p = await master("PRODUCT", "EXP", {
      type: "STOCK",
      uom: "PCS",
      trackExpiry: true,
    });
    await finalize(
      await draft(
        "purchase",
        { partnerId: vendor.id, dueDate: date, warehouseId: warehouse.id },
        [
          line(p.id, "10", "2", {
            lotCode: "EXPIRED",
            expiresAt: "2026-11-10",
          }),
        ],
        admin,
        "A-1",
        "2026-11-01",
      ),
    );
    const r = await draft(
      "inventory",
      { operation: "ISSUE", warehouseId: warehouse.id, reason: "Must fail" },
      [line(p.id, "0")],
    );
    await assert.rejects(finalize(r));
    await abandon(r);
    assert.equal(
      (
        await db.stockLot.findFirstOrThrow({ where: { productId: p.id } })
      ).quantity.toString(),
      "2",
    );
  });
  await t.test("transfers preserve quantity and exact valuation", async () => {
    const issued=await db.stockMovement.findMany({where:{quantity:{lt:0}}});
    assert.ok(issued.every(m=>m.effectiveDate.toISOString().slice(0,10)===date), 'stock issues retain their document date');
    const before = await db.stockLot.findFirstOrThrow({
      where: { lotCode: "LATE", warehouseId: warehouse.id },
    });
    await finalize(
      await draft(
        "inventory",
        {
          operation: "TRANSFER",
          warehouseId: warehouse.id,
          destinationId: warehouseB.id,
          reason: "Move to site",
        },
        [line(product.id, "0", "1")],
      ),
      admin,
      manager,
    );
    const b = await db.stockLot.findFirstOrThrow({
      where: { lotCode: "LATE", warehouseId: warehouseB.id },
    });
    assert.equal(b.value.toString(), "120");
    assert.equal(
      (
        await db.stockLot.findUniqueOrThrow({ where: { id: before.id } })
      ).value.toString(),
      "360",
    );
  });
  await t.test(
    "manufacturing conserves cents even when unit cost must round",
    async () => {
      const ingredient = await master("PRODUCT", "RAW", {
        type: "STOCK",
        uom: "PCS",
      });
      const finished = await master("PRODUCT", "FIN", {
        type: "STOCK",
        uom: "PCS",
        trackExpiry: true,
      });
      await finalize(
        await draft(
          "purchase",
          { partnerId: vendor.id, dueDate: date, warehouseId: warehouse.id },
          [line(ingredient.id, "0.05", "1")],
          admin,
          "A-1",
          "2026-11-01",
        ),
      );
      const bom = await master("BOM", "RECIPE", {
        productId: finished.id,
        outputQuantity: "2",
        ingredients: `${ingredient.id}=1`,
      });
      await finalize(
        await draft("manufacturing", {
          bomId: bom.id,
          warehouseId: warehouse.id,
          quantity: "2",
          lotCode: "FINISHED",
          expiresAt: "2026-11-30",
        }),
        admin,
        manager,
      );
      const lot = await db.stockLot.findFirstOrThrow({
        where: { productId: finished.id },
      });
      assert.equal(lot.quantity.toString(), "2");
      assert.equal(lot.value.toString(), "0.05");
      for (let i = 0; i < 2; i++)
        await finalize(
          await draft(
            "inventory",
            {
              operation: "ISSUE",
              warehouseId: warehouse.id,
              reason: "Use production",
            },
            [line(finished.id, "0")],
          ),
        );
      const final = await db.stockLot.findUniqueOrThrow({
        where: { id: lot.id },
      });
      assert.equal(final.quantity.toString(), "0");
      assert.equal(final.value.toString(), "0");
    },
  );
  await t.test(
    "POS cash reconciliation closes shift and blocks further posting to it",
    async () => {
      await finalize(
        await draft(
          "pos",
          {
            warehouseId: warehouse.id,
            paymentMethod: "CASH",
            shift: "MORNING",
          },
          [line(service.id, "25")],
        ),
      );
      const close = await finalize(
        await draft("pos-close", { shift: "MORNING", countedCash: "25" }),
        admin,
        manager,
      );
      assert.equal(object(close.data).expectedCash, "25.00");
      assert.equal(object(close.data).variance, "0.00");
      const duplicate = await draft("pos-close", {
        shift: "MORNING",
        countedCash: "25",
      });
      await assert.rejects(finalize(duplicate, admin, manager));
      await abandon(duplicate);
      const r = await draft(
        "pos",
        { warehouseId: warehouse.id, paymentMethod: "CASH", shift: "MORNING" },
        [line(service.id, "25")],
      );
      await assert.rejects(finalize(r));
      await abandon(r);
    },
  );
  await t.test(
    "WIB shift and attendance calculate lateness and create notification",
    async () => {
      const shift = await finalize(
        await draft("shifts", {
          employeeId: employee.id,
          projectId: (await master("PROJECT", "PRJ", { cluster: "CLEANING" }))
            .id,
          startAt: "2026-11-17T08:00",
          endAt: "2026-11-17T16:00",
        }),
        admin,
        manager,
      );
      assert.equal(object(shift.data).startAt, "2026-11-17T01:00:00.000Z");
      const attendance = await finalize(
        await draft(
          "attendances",
          {
            employeeId: employee.id,
            checkIn: "2026-11-17T08:15",
            checkOut: "2026-11-17T16:00",
            latitude: "-6.2",
            longitude: "106.8",
            accuracy: "5",
            shift: shift.number,
          },
          [],
          staff,
        ),
        manager,
        manager,
      );
      assert.equal(object(attendance.data).lateMinutes, 15);
      assert.ok(
        await db.discussion.count({
          where: { referenceId: attendance.id, system: true },
        }),
      );
    },
  );
  await t.test("timesheet overlaps are rejected", async () => {
    const project = await db.masterRecord.findFirstOrThrow({
      where: { code: "PRJ" },
    });
    await finalize(
      await draft("timesheets", {
        employeeId: employee.id,
        projectId: project.id,
        startAt: "2026-11-17T08:00",
        endAt: "2026-11-17T09:00",
        hourlyRate: "100",
        work: "Test work",
      }),
      admin,
      manager,
    );
    const r = await draft("timesheets", {
      employeeId: employee.id,
      projectId: project.id,
      startAt: "2026-11-17T08:30",
      endAt: "2026-11-17T09:30",
      hourlyRate: "100",
      work: "Overlap",
    });
    await assert.rejects(finalize(r, admin, manager));
    await abandon(r);
  });
  await t.test(
    "asset handover and maintenance update custody and service date",
    async () => {
      await finalize(
        await draft("asset-handover", {
          assetId: asset.id,
          employeeId: employee.id,
          location: "Site A",
          condition: "GOOD",
        }),
        admin,
        manager,
      );
      assert.equal(
        object(
          (await db.masterRecord.findUniqueOrThrow({ where: { id: asset.id } }))
            .data,
        ).custodianId,
        employee.id,
      );
      await finalize(
        await draft("maintenance", {
          assetId: asset.id,
          maintenanceType: "PREVENTIVE",
          dueDate: date,
          nextDueDate: "2026-12-17",
          cost: "100",
          result: "Test completed",
        }),
      );
      assert.equal(
        object(
          (await db.masterRecord.findUniqueOrThrow({ where: { id: asset.id } }))
            .data,
        ).nextMaintenance,
        "2026-12-17",
      );
    },
  );
  await t.test(
    "stock backdating and posted document edits are rejected",
    async () => {
      const r = await draft(
        "inventory",
        {
          operation: "TRANSFER",
          warehouseId: warehouse.id,
          destinationId: warehouseB.id,
          reason: "Backdate",
        },
        [line(product.id, "0")],
        admin,
        "A-1",
        "2026-11-10",
      );
      await assert.rejects(finalize(r, admin, manager));
      await abandon(r);
      await assert.rejects(
        db.businessRecord.update({
          where: { id: sale.id },
          data: { title: "Tampered" },
        }),
      );
      await assert.rejects(
        db.businessLine.updateMany({
          where: { recordId: sale.id },
          data: { description: "Tampered" },
        }),
      );
    },
  );
  await t.test(
    "restricted staff snapshot cannot expose other branches or other employees",
    async () => {
      const result = await operationSnapshot(staff, "A");
      assert.ok(result.branches.every((b) => b.id === "A-1"));
      assert.ok(
        result.records.every(
          (r) => r.actorId === staff.id && r.branchId === "A-1",
        ),
      );
      assert.ok(result.stock.every((l) => l.branchId === "A-1"));
      assert.ok(
        result.masters
          .filter((m) => m.kind === "EMPLOYEE")
          .every((m) => m.id === employee.id),
      );
      await assert.rejects(operationSnapshot(staff, "B"));
    },
  );
  await t.test(
    "all posted journals balance and mapped receivable reconciles after settlement",
    async () => {
      const periods = await db.fiscalPeriod.findMany({
        where: { companyId: "A" },
      });
      const report = (await snapshot(periods[0].id, "A")).report;
      assert.equal(report.trialDebit, report.trialCredit);
      assert.equal(report.balanceDifference, "0.00");
      assert.equal(report.receivables, "0.00");
    },
  );
  await t.test(
    "account contra balances subtract from asset totals",
    async () => {
      const contra = await db.account.create({
        data: {
          id: "contra",
          code: "1099",
          name: "Accumulated depreciation",
          category: "ASET",
          normalBalance: "KREDIT",
          isContra: true,
        },
      });
      const period = await db.fiscalPeriod.findFirstOrThrow({
        where: { companyId: "A" },
      });
      const { createJournal } = await import("../src/lib/accounting");
      await createJournal({
        periodId: period.id,
        date,
        type: "ADJUSTING",
        description: "Depreciation",
        lines: [
          { accountId: "expense", debit: "10", credit: "0" },
          { accountId: contra.id, debit: "0", credit: "10" },
        ],
      });
      const r = (await snapshot(period.id, "A")).report;
      assert.equal(r.rows.find((a) => a.id === "contra")?.net, "-10.00");
      assert.equal(r.balanceDifference, "0.00");
    },
  );
  await t.test(
    "HR and branch roles cannot read company-wide source registers",
    async () => {
      const { requireSourceAccess, importWhere, sourceWhere } = await import(
        "../src/lib/operations/visibility"
      );
      assert.throws(() => requireSourceAccess(staff, "A"));
      const hr = actor("hr", "HR");
      const result = await operationSnapshot(hr, "A");
      assert.ok(
        result.records.every((r) =>
          [
            "attendances",
            "timesheets",
            "shifts",
            "project",
            "quality",
          ].includes(r.module),
        ),
      );
      assert.ok(
        result.stats.every((r) =>
          [
            "attendances",
            "timesheets",
            "shifts",
            "project",
            "quality",
          ].includes(r.module),
        ),
      );
      await assert.rejects(
        transitionRecord(hr, {
          companyId: "A",
          id: sale.id,
          version: sale.version,
          action: "post",
        }),
      );
    },
  );
  await t.test(
    "branch financial insights use ledger revenue before tax and enforce company scope",
    async () => {
      const { operationalInsights } = await import(
        "../src/lib/operations/insights"
      );
      const insight = await operationalInsights(
        admin,
        "A",
        "A-1",
        new Date("2026-11-17Z"),
      );
      const row = insight.branches.find((b) => b.branchId === "A-1");
      assert.ok(row);
      assert.equal(row.revenue, "1225.00");
      assert.equal(insight.month, "2026-11");
      assert.equal(
        (await operationalInsights(staff, "A", "A-1")).financial,
        false,
      );
      await assert.rejects(operationalInsights(staff, "B"));
    },
  );
  await t.test(
    "confirmed sales and purchase orders never inflate financial balances",
    async () => {
      await finalize(
        await draft(
          "sales",
          { documentType: "ORDER", partnerId: customer.id, dueDate: date },
          [line(service.id, "9999")],
        ),
      );
      await finalize(
        await draft(
          "purchase",
          { documentType: "ORDER", partnerId: vendor.id, dueDate: date },
          [line(service.id, "9999")],
        ),
      );
      const result = await operationSnapshot(admin, "A");
      const gross = result.stats.find(
        (s) => s.module === "sales" && s.status === "POSTED",
      )!;
      const financial = result.financialStats.find(
        (s) => s.module === "sales" && s.status === "POSTED",
      )!;
      assert.equal(gross._count, 2);
      assert.equal(financial._count, 1);
      assert.equal(financial._sum.amount?.toString(), "1332");
      assert.equal(financial._sum.settled?.toString(), "1332");
    },
  );
  await t.test("close rejects unfinished operational documents", async () => {
    await draft("payments", {
      referenceId: bill.number,
      direction: "PAY",
      amount: "1",
    });
    const period = await db.fiscalPeriod.findFirstOrThrow({
      where: { companyId: "A" },
    });
    await assert.rejects(closePeriod(period.id));
  });
  await t.test(
    "fiscal dates can overlap between companies but never within one",
    async () => {
      await db.fiscalPeriod.create({
        data: {
          id: "B-period",
          companyId: "B",
          name: "November",
          startDate: new Date("2026-11-01Z"),
          endDate: new Date("2026-11-30Z"),
        },
      });
      await assert.rejects(
        db.fiscalPeriod.create({
          data: {
            companyId: "B",
            name: "Overlap",
            startDate: new Date("2026-11-15Z"),
            endDate: new Date("2026-12-15Z"),
          },
        }),
      );
      await db.fiscalPeriod.update({
        where: { id: "B-period" },
        data: { status: "CLOSED" },
      });
      const p = await saveMaster(admin, {
        companyId: "B",
        branchId: "B-1",
        kind: "EMPLOYEE",
        code: "EMP-B",
        name: "Employee B",
        data: { position: "Operator" },
      });
      const r = await saveRecord(admin, {
        companyId: "B",
        branchId: "B-1",
        module: "cash-advance",
        title: "Closed period test",
        date,
        data: { employeeId: p.id, dueDate: date, purpose: "Test" },
        lines: [line(undefined, "1")],
      });
      await assert.rejects(finalize(r, admin, admin));
    },
  );
  await t.test(
    "approval matrix: OPS verification, amount tiers, project quota, SoD and FR-CA-003",
    async () => {
      const director = actor("director", "DIRECTOR"),
        supervisor = actor("supervisor", "SUPERVISOR"),
        manager2 = actor("manager2", "MANAGER"),
        admin2 = actor("admin2", "ADMIN"),
        finance2 = actor("finance2", "FINANCE");
      const go = (who: Actor, r: any, action: string, reason?: string) =>
        transitionRecord(who, {
          companyId: "A",
          id: r.id,
          version: r.version,
          action,
          reason,
        });
      await db.company.update({
        where: { id: "A" },
        data: {
          settings: {
            accounting: map,
            approval: {
              purchase: {
                requireOpsVerification: true,
                managerLimit: "1000",
                directorLimit: "5000",
              },
            },
          },
        },
      });
      try {
        const project = await master("PROJECT", "PRJQ", { cluster: "CLEANING" });
        await master("PURCHASE_QUOTA", "Q1", {
          projectId: project.id,
          productId: product.id,
          maxQuantity: "8",
        });
        const po = (q: string, p = product, price = "100") =>
          draft(
            "purchase",
            {
              documentType: "ORDER",
              partnerId: vendor.id,
              dueDate: date,
              projectId: project.id,
              opsVerifiedBy: "forged",
            },
            [line(p.id, price, q)],
            manager,
          );
        let a = await po("5");
        assert.equal(object(a.data).opsVerifiedBy, undefined, "forged stamp stripped");
        a = await go(manager, a, "submit");
        await assert.rejects(go(director, a, "approve"), /verifikasi OPS/);
        await assert.rejects(go(manager, a, "verify"), /Pembuat/);
        a = await go(supervisor, a, "verify");
        assert.equal(object(a.data).opsVerifiedBy, "supervisor");
        await assert.rejects(go(supervisor, a, "verify"), /sudah diverifikasi/);
        a = await go(manager2, a, "approve");
        assert.equal(a.status, "APPROVED");
        assert.equal(object(a.data).approvalTier, "MANAGER");

        let b = await go(manager, await po("20", service), "submit");
        b = await go(supervisor, b, "verify");
        await assert.rejects(go(manager2, b, "approve"), /Direktur/);
        b = await go(director, b, "approve");
        assert.equal(object(b.data).approvalTier, "DIRECTOR");

        let c = await go(manager, await po("90", service), "submit");
        c = await go(supervisor, c, "verify");
        await assert.rejects(go(director, c, "approve"), /Administrator/);
        c = await go(admin2, c, "approve");
        assert.equal(object(c.data).approvalTier, "ADMIN");

        let q = await go(manager, await po("5"), "submit");
        q = await go(supervisor, q, "verify");
        await assert.rejects(go(manager2, q, "approve"), /batasan permintaan/);
        await assert.rejects(go(admin2, q, "approve"), /alasan/);
        q = await go(admin2, q, "approve", "Tambahan area proyek disetujui BOD");
        assert.equal(object(object(q.data).quotaOverride).by, "admin2");

        const request = await draft(
          "purchase",
          { documentType: "REQUEST", dueDate: date },
          [line(product.id, "10", "2")],
          manager,
        );
        assert.equal(object(request.data).documentType, "REQUEST");
        await assert.rejects(
          draft("purchase", { documentType: "ORDER", dueDate: date }, [
            line(product.id, "10"),
          ]),
          /Pemasok wajib/,
        );
        for (const r of [b, c, q]) await abandon(r);
        await abandon(a);
      } finally {
        await db.company.update({
          where: { id: "A" },
          data: { settings: { accounting: map } },
        });
      }

      const holder = await master("EMPLOYEE", "EMPQ", { position: "Operator" });
      const advance = () =>
        draft(
          "cash-advance",
          { employeeId: holder.id, dueDate: "2026-11-30", purpose: "Uji FR-CA-003" },
          [line(undefined, "300")],
        );
      let first = await go(admin, await advance(), "submit");
      const second = await advance();
      await assert.rejects(go(admin, second, "submit"), /kasbon terbuka/);
      first = await go(finance, first, "approve");
      await assert.rejects(go(finance, first, "post"), /Pemberi persetujuan/);
      first = await go(finance2, first, "post");
      assert.equal(first.status, "POSTED");
      await assert.rejects(go(admin, second, "submit"), /kasbon terbuka/);
      await abandon(second);

      await assert.rejects(
        master("PARTNER", "VENTAX", { type: "VENDOR", taxId: "12.345" }),
        /NPWP/,
      );
      await master("PARTNER", "VENTAX", {
        type: "VENDOR",
        taxId: "01.234.567.8-901.000",
      });
    },
  );
  await t.test(
    "report finalisation needs evidence, director risk acceptance and two different sign-offs",
    async () => {
      const { finalizationStatus, updateFinalization, assertCloseAllowed } = await import("../src/lib/finalization");
      const director = actor("director2", "DIRECTOR"), fin = actor("finance3", "FINANCE");
      const period = await db.fiscalPeriod.create({
        data: { companyId: "A", name: "Uji finalisasi", startDate: new Date("2031-01-01T00:00:00Z"), endDate: new Date("2031-01-31T00:00:00Z") },
      });
      await db.company.update({ where: { id: "A" }, data: { settings: { accounting: map, historicalLedger: { from: "2031-01-01", through: "2031-01-31", periodId: period.id, source: "Uji" } } } });
      await db.sourceFile.upsert({ where: { id: "uji" }, update: {}, create: { id: "uji", companyId: "A", name: "Kertas kerja uji", mime: "application/vnd.ms-excel", path: "uji", url: "" } });
      await db.dataImportBatch.upsert({ where: { id: "uji" }, update: {}, create: { id: "uji", companyId: "A", name: "Batch uji finalisasi" } });
      for (const [i, code, sev] of [[1, "T01", "T"], [2, "T02", "S"]] as const)
        await db.sourceFact.create({ data: { id: `fin-${code}`, companyId: "A", batchId: "uji", kind: "CONTROL", sourceKey: `uji-${code}`, sourceFileId: "uji", sheet: "TEMUAN", row: i, data: { cells: { "1": code, "2": `Temuan ${code}`, "4": sev, "7": "Finance", "8": "30-Nov-26" } } } });
      const go = (who: Actor, data: Record<string, unknown>) => updateFinalization(who, "A", { periodId: period.id, ...data });
      const { saveServicePlan, emptyServicePlan, calkSections } = await import('../src/lib/service-plans');
      const { createJournal } = await import('../src/lib/accounting');
      await createJournal({ periodId: period.id, date: '2031-01-01', type: 'OPENING', description: 'Saldo uji terisolasi finalisasi', lines: [{ accountId: map.cash, debit: '0.01', credit: '0' }, { accountId: map.payable, debit: '0', credit: '0.01' }] }, fin.id);
      await saveServicePlan(fin, { ...emptyServicePlan(), companyId: 'A', periodId: period.id, framework: 'SAK_EP', frameworkEvidence: 'Dasar keputusan kerangka pada fixture terisolasi', notes: Object.fromEntries(calkSections.map(([key]) => [key, 'Catatan penjelasan untuk uji finalisasi terisolasi.'])) });
      try {
        let s = await finalizationStatus("A", period.id);
        assert.equal(s.state, "DRAFT");
        await assert.rejects(assertCloseAllowed(period.id), /belum dapat ditutup/);
        await assert.rejects(go(fin, { action: "signoff", role: "FINANCE", note: "Diperiksa lengkap" }), /belum lulus/);
        await assert.rejects(go(fin, { action: "finding", code: "T01", status: "RESOLVED", note: "Payroll aktual telah dibukukan lengkap" }), /bukti/);
        await assert.rejects(go(fin, { action: "finding", code: "T01", status: "ACCEPTED_RISK", note: "Risiko diterima oleh Finance saja" }), /Direksi/);
        s = await go(fin, { action: "finding", code: "T01", status: "RESOLVED", note: "Payroll aktual telah dibukukan lengkap", evidence: "JP-2031-0001" });
        assert.equal(s.findings.find((f) => f.code === "T01")!.status, "RESOLVED");
        assert.ok(s.readyForSignOff, "only T-level findings block sign-off");
        await assert.rejects(go(director, { action: "signoff", role: "DIRECTOR", note: "Disetujui direksi" }), /setelah sign-off Finance/);
        s = await go(fin, { action: "signoff", role: "FINANCE", note: "Diperiksa lengkap" });
        await assert.rejects(go(fin, { action: "signoff", role: "DIRECTOR", note: "Disetujui sendiri" }), /Direktur|berbeda/);
        s = await go(director, { action: "signoff", role: "DIRECTOR", note: "Disetujui direksi" });
        await assertCloseAllowed(period.id);
        s = await go(fin, { action: "finding", code: "T02", status: "IN_PROGRESS", note: "" });
        assert.equal(s.signoffs.length, 0, "a change after sign-off invalidates it");
        await assert.rejects(assertCloseAllowed(period.id));
      } finally {
        await db.company.update({ where: { id: "A" }, data: { settings: { accounting: map } } });
        await db.sourceFact.deleteMany({ where: { batchId: "uji" } });
        // Fiscal periods cannot be deleted (database invariant); the 2031 test period stays.
      }
    },
  );
  await t.test(
    "documents inside a period booked from the working paper cannot be posted twice",
    async () => {
      await db.company.update({
        where: { id: "A" },
        data: {
          settings: {
            accounting: map,
            historicalLedger: { from: "2026-11-01", through: "2026-11-30", source: "Kertas kerja uji" },
          },
        },
      });
      try {
        const r = await draft("purchase", { partnerId: vendor.id, dueDate: date }, [line(service.id, "10")]);
        await assert.rejects(finalize(r), /sudah dibukukan dari Kertas kerja uji/);
        await abandon(r);
      } finally {
        await db.company.update({ where: { id: "A" }, data: { settings: { accounting: map } } });
      }
    },
  );
});
