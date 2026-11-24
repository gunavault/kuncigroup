// v8 browser QA (read-only): bank reconciliation, mapped ratios and the evidence register in the journal trace.
//   UI_URL=http://127.0.0.1:3004 node scripts/qa-ui-v8.mjs
//   UI_URL=https://<cloud-url> node scripts/qa-ui-v8.mjs   (APP_PASSWORD or data/kunci-cloud-access.txt)
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
const base = process.env.UI_URL ?? 'http://127.0.0.1:3004', cloud = new URL(base).protocol === 'https:';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
const folder = `data/ui-qa-v8/${cloud ? 'cloud' : 'local'}`;
mkdirSync(folder, { recursive: true }); page.setDefaultTimeout(120000);
page.on('pageerror', (e) => errors.push(e.message));
const check = async (name, fn) => { await fn(); console.log('PASS', name); };
try {
  const login = cloud
    ? { email: 'admin@kuncigroup.cloud', password: process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim() }
    : existsSync('data/qa-v7-login.json') ? JSON.parse(readFileSync('data/qa-v7-login.json', 'utf8')) : null;
  if (login) assert.equal((await context.request.post(base + '/api/session', { headers: { origin: base }, data: login })).status(), 200, 'login');
  const erp = await (await context.request.get(base + '/api/erp?company=KBA')).json();
  const rec = await (await context.request.get(`${base}/api/operations?company=KBA&view=bank-reconciliation&period=${erp.period.id}`)).json();
  await check('bank reconciliation API matches statement lines and lists both unmatched sides', async () => {
    assert.equal(rec.account.code, '11107');
    assert.ok(rec.totals.matched > 0);
    assert.equal(rec.totals.matched + rec.totals.statementOnly, rec.perMonth.reduce((s, m) => s + m.statement.lines, 0));
    assert.equal(rec.totals.matched + rec.totals.bookOnly, rec.perMonth.reduce((s, m) => s + m.book.lines, 0));
    assert.ok(rec.breaks.length >= 1, 'statement continuity breaks are reported');
  });
  await check('accounting page shows reconciliation and drills from a book-only item to its journal', async () => {
    await page.goto(base + '/accounting?company=KBA');
    await page.getByRole('button', { name: /Rekonsiliasi bank/ }).click();
    const panel = page.getByRole('region', { name: 'Rekonsiliasi bank' });
    await panel.waitFor();
    assert.ok((await panel.locator('tbody tr').count()) >= 9);
    await page.screenshot({ path: `${folder}/bank-reconciliation.png`, fullPage: true });
    const items = page.getByRole('region', { name: 'Item belum cocok' });
    await items.getByRole('button', { name: /Hanya di buku/ }).click();
    await items.locator('tbody button.trace-link').first().click();
    await page.getByRole('dialog', { name: 'Telusur laporan → bukti sumber' }).getByText('Register bukti transaksi', { exact: true }).waitFor();
  });
  await check('finalisation lists the bank reconciliation requirement', async () => {
    const f = await (await context.request.get(`${base}/api/operations?company=KBA&view=finalization&period=${erp.period.id}`)).json();
    const bank = f.checks.find((c) => c.key === 'bank');
    assert.ok(bank, 'bank check present');
    if (!bank.ok) assert.ok(bank.detail.length > 0);
  });
  await check('mapped ratios are computed with traceable components', async () => {
    const r = await (await context.request.get(`${base}/api/financial-ratios?company=KBA&period=${erp.period.id}`)).json();
    const current = r.ratios.find((x) => x.key === 'current');
    assert.ok(current.value !== null || current.reason, 'current ratio computed or explained');
    if (current.value !== null) assert.ok(current.traces.length > 0, 'current ratio drills to mapped accounts');
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
} finally {
  await browser.close();
}
