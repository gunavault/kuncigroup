import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
const base = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";
let password = process.env.APP_PASSWORD;
if (!password)
  password = readFileSync("data/kunci-cloud-access.txt", "utf8")
    .match(/^Password aplikasi: (.+)$/m)?.[1]
    .trim();
if (!password) throw new Error("Kredensial pengujian tidak tersedia.");
for (const path of [
  "/api/operations?company=KBA",
  "/api/documents?company=KBA&id=none",
  "/api/barcode?company=KBA&text=none",
])
  assert.equal((await fetch(base + path)).status, 401);
const login = await fetch(base + "/api/session", {
  method: "POST",
  headers: { origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@kuncigroup.cloud", password }),
});
assert.equal(login.status, 200, "login administrator");
const setCookie = login.headers.getSetCookie()[0];
assert.ok(
  setCookie.includes("HttpOnly") &&
    setCookie.includes("Secure") &&
    setCookie.includes("SameSite=strict"),
);
const cookie = setCookie.split(";")[0],
  headers = { cookie };
const home = await fetch(base + "/api/operations?company=KBA", { headers });
assert.equal(home.status, 200);
const state = await home.json();
assert.equal(state.modules.length, 19);
assert.ok(state.masters.length > 500);
assert.ok(
  state.records.every((r: any) => r.status === "IMPORTED"),
  "historical records remain unposted",
);
assert.ok(state.permissions.sourceAccess);
const sources = await fetch(base + "/api/operations?company=KBA&view=sources", {
  headers,
});
assert.equal(sources.status, 200);
const source = await sources.json();
assert.ok(source.total > 10000, "full index persisted");
const imports = await fetch(base + "/api/operations?company=KBA&view=imports", {
  headers,
});
assert.equal(imports.status, 200);
const rows = await imports.json();
assert.ok(rows.total > 1000);
const doc = await fetch(
  base + `/api/documents?company=KBA&id=${state.records[0].id}`,
  { headers },
);
assert.equal(doc.status, 200);
const bytes = new Uint8Array(await doc.arrayBuffer());
assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
const product = state.masters.find(
  (m: any) => m.kind === "PRODUCT" && /^[\x20-\x7e]{1,100}$/.test(m.code),
);
const barcode = await fetch(
  base + `/api/barcode?company=KBA&text=${encodeURIComponent(product.code)}`,
  { headers },
);
assert.equal(barcode.status, 200);
assert.equal(barcode.headers.get("content-type"), "image/png");
const report = await fetch(base + "/api/erp?company=KBA", { headers });
assert.equal(report.status, 200);
const financial = await report.json();
assert.equal(financial.company.id, "KBA");
assert.equal(financial.journals.length, 0, "no fabricated opening balances");
assert.equal(financial.report.balanceDifference, "0.00");
const malicious = await fetch(base + "/api/operations", {
  method: "POST",
  headers: {
    cookie,
    origin: "https://untrusted.invalid",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "message",
    companyId: "KBA",
    data: { body: "blocked" },
  }),
});
assert.equal(malicious.status, 400);
const logout = await fetch(base + "/api/session", {
  method: "DELETE",
  headers: { cookie, origin: base },
});
assert.equal(logout.status, 200);
assert.equal(
  (await fetch(base + "/api/operations?company=KBA", { headers })).status,
  401,
  "logout revokes session",
);
const summary = {
  base,
  modules: state.modules.length,
  mastersKBA: state.masters.length,
  sourceEntriesKBA: source.total,
  reviewRowsKBA: rows.total,
  historicalUnposted: true,
  checks: [
    "authentication",
    "secure cookie",
    "opaque session revocation",
    "company snapshot",
    "source register",
    "import register",
    "document PDF",
    "barcode PNG",
    "financial isolation",
    "CSRF",
  ],
};
mkdirSync("data", { recursive: true });
writeFileSync("data/operations-smoke.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
