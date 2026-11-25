// v6 browser QA: ledger, financial statements, management report and dashboards show real figures.
//   UI_URL=http://127.0.0.1:3000 node scripts/qa-ui-v6.mjs
//   UI_URL=https://<cloud-url> node scripts/qa-ui-v6.mjs   (logs in with APP_PASSWORD or data/kunci-cloud-access.txt)
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
const base = process.env.UI_URL ?? 'http://127.0.0.1:3000';
const cloud = new URL(base).protocol === 'https:';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(120000);
mkdirSync('data/ui-qa-v6', { recursive: true });
const check = async (name, fn) => { await fn(); console.log('PASS', name); };
try {
  if (cloud) {
    const password = process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim();
    assert.ok(password);
    const r = await context.request.post(base + '/api/session', { headers: { origin: base }, data: { email: 'admin@kuncigroup.cloud', password } });
    assert.equal(r.status(), 200);
  } else if (existsSync('data/qa-v7-login.json')) {
    // Local servers with APP_PASSWORD set need a session as well.
    const r = await context.request.post(base + '/api/session', { headers: { origin: base }, data: JSON.parse(readFileSync('data/qa-v7-login.json', 'utf8')) });
    assert.equal(r.status(), 200);
  }
  const erp = await (await context.request.get(base + '/api/erp?company=KBA')).json();
  await check('Accounting opens on the booked period with balanced statements', async () => {
    assert.match(erp.period.name, /Oktober 2026/);
    assert.ok(erp.journals.length >= 2000);
    assert.equal(erp.report.balanceDifference, '0.00');
    assert.equal(erp.report.trialDebit, erp.report.trialCredit);
    assert.equal(erp.report.cash.difference, '0.00');
    assert.notEqual(erp.report.revenue, '0.00');
  });
  await check('accounting dashboard renders non-zero KPIs', async () => {
    await page.goto(base + '/accounting?company=KBA');
    await page.getByText('Ringkasan keuangan').first().waitFor();
    const text = await page.locator('.kpi-grid').first().innerText();
    assert.ok(/Rp\s?[1-9]/.test(text), 'KPI shows a non-zero rupiah value');
    await page.screenshot({ path: 'data/ui-qa-v6/accounting-dashboard.png', fullPage: false });
  });
  await check('financial statements page shows the booked figures', async () => {
    await page.getByRole('button', { name: /Laporan keuangan/ }).click();
    await page.locator('.statement').first().waitFor();
    assert.ok((await page.locator('.statement').count()) >= 2);
    await page.screenshot({ path: 'data/ui-qa-v6/financial-statements.png' });
  });
  await check('management report renders narrative, trend and findings', async () => {
    await page.getByRole('button', { name: /Laporan manajemen/ }).click();
    await page.getByText('Ringkasan eksekutif').waitFor();
    assert.ok((await page.locator('.narrative li').count()) >= 5);
    assert.ok((await page.locator('table').filter({ hasText: 'Oktober 2026' }).count()) >= 1, 'monthly trend lists October');
    assert.ok((await page.getByText('Temuan kertas kerja').count()) >= 1);
    await page.screenshot({ path: 'data/ui-qa-v6/management-report.png', fullPage: true });
  });
  await check('finalisation panel shows status, checklist and close blockers (read-only check)', async () => {
    await page.getByRole('region', { name: 'Finalisasi laporan' }).waitFor();
    assert.ok((await page.locator('.checklist li').count()) >= 8);
    const f = await (await context.request.get(`${base}/api/operations?company=KBA&view=finalization&period=${erp.period.id}`)).json();
    assert.ok(['DRAFT', 'FINAL', 'FINAL_WITH_EXCEPTIONS'].includes(f.state));
    if (f.state === 'DRAFT') assert.ok(f.blockersForClose.length > 0, 'a draft period lists what blocks closing');
    const m = await (await context.request.get(base + '/api/operations?company=KBA&view=management-report')).json();
    assert.match(m.status, /DRAFT|FINAL/);
  });
  await check('management report exports as PDF and Excel', async () => {
    const m = await (await context.request.get(base + '/api/operations?company=KBA&view=management-report')).json();
    for (const f of ['pdf', 'xlsx']) {
      const r = await context.request.get(`${base}/api/export?report=management&company=KBA&period=${m.period.id}&format=${f}`);
      assert.equal(r.status(), 200, f);
      assert.ok((await r.body()).length > 5000, f);
    }
  });
  await check('operations dashboard shows the latest booked month', async () => {
    await page.goto(base + '/?module=dashboards');
    await page.getByText(/Laba rugi per cabang · 2026-10/).waitFor();
    const text = await page.locator('section.panel').filter({ hasText: 'Laba rugi per cabang' }).innerText();
    assert.ok(/Rp\s?[1-9]/.test(text));
    await page.screenshot({ path: 'data/ui-qa-v6/operations-dashboard.png' });
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
} finally {
  await browser.close();
}
