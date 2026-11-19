import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base = process.env.UI_URL ?? 'http://127.0.0.1:3001';
const cloud = new URL(base).protocol === 'https:';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(60000);
mkdirSync('artifacts', { recursive: true }); mkdirSync('data/ui-qa-v4', { recursive: true });
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
try {
  if (cloud) {
    const password = process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim();
    assert.ok(password); const r = await context.request.post(base + '/api/session', { headers: { origin: base }, data: { email: 'admin@kuncigroup.cloud', password } }); assert.equal(r.status(), 200);
  }
  const state = await (await context.request.get(base + '/api/operations?company=KBA')).json(); assert.equal(state.modules.length, 19);
  await check('19 module dashboards render 4–6 populated cards matching the API', async () => {
    for (const m of state.modules) {
      const url = m.key === 'accounting' ? '/accounting?company=KBA' : '/?module=' + m.key;
      await page.goto(base + url); const dashboard = page.getByRole('region', { name: 'Ringkasan modul', exact: true });
      // <section aria-label> creates an accessible region.
      await dashboard.waitFor(); await page.waitForFunction(() => document.querySelector('.module-mini-dashboard')?.getAttribute('aria-busy') === 'false');
      await page.waitForFunction(() => { const d = document.querySelector('.module-mini-dashboard'); return d && d.getAttribute('aria-busy') === 'false' && !d.textContent.includes('Memuat…'); });
      assert.equal(await dashboard.locator('.alert.error').count(), 0, m.key);
      const count = await dashboard.locator('.module-mini-card').count(); assert.ok(count >= 4 && count <= 6, m.key);
      assert.ok(!(await dashboard.innerText()).includes('Memuat…'), m.key);
      const r = await context.request.get(base + '/api/operations?' + new URLSearchParams({ view: 'module-kpis', company: 'KBA', module: m.key }));
      assert.equal(r.status(), 200, m.key); assert.match(r.headers()['cache-control'], /no-store/);
      const data = await r.json(); assert.equal(data.cards.length, count, m.key);
    }
  });
  await check('branch selection preserves shared catalog and module cards stay scoped', async () => {
    const b = state.branches[0]; assert.ok(b);
    await page.goto(base + '/?module=sales'); await page.locator('.module-mini-card').first().waitFor();
    const branchSelect = page.getByLabel('Cabang / lokasi', { exact: true });
    if (await branchSelect.count()) await branchSelect.selectOption(b.id);
    const r = await (await context.request.get(base + '/api/operations?' + new URLSearchParams({ company: 'KBA', branch: b.id }))).json();
    assert.ok(r.masters.filter(m => m.branchId === null).every(m => ['PRODUCT','PARTNER','BOM','DEPARTMENT','POSITION','ASSET_CLASS'].includes(m.kind)));
    const cards = await (await context.request.get(base + '/api/operations?' + new URLSearchParams({ view: 'module-kpis', company: 'KBA', module: 'sales', branch: b.id }))).json();
    assert.ok(cards.scope.includes('Cabang terpilih'));
  });
  await check('API search returns zero for a missing document without carrying previous values', async () => {
    const r = await context.request.get(base + '/api/operations?' + new URLSearchParams({ view: 'module-kpis', company: 'KBA', module: 'sales', q: '__QA_NO_SUCH_DOCUMENT__' }));
    assert.equal(r.status(), 200); assert.equal((await r.json()).cards.find(c => c.key === 'total').value, '0');
  });
  await check('all module cards fit a 390px mobile viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const m of state.modules) {
      await page.goto(base + (m.key === 'accounting' ? '/accounting?company=KBA' : '/?module=' + m.key));
      await page.locator('.module-mini-dashboard[aria-busy="false"]').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), m.key);
    }
    await page.goto(base + '/?module=sales'); await page.locator('.module-mini-dashboard[aria-busy="false"]').waitFor();
    await page.screenshot({ path: 'data/ui-qa-v4/mobile.png', fullPage: false });
  });
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base + '/?module=inventory'); await page.locator('.module-mini-dashboard[aria-busy="false"]').waitFor();
  await page.screenshot({ path: 'data/ui-qa-v4/desktop.png', fullPage: false });
  if (cloud) { await context.request.delete(base + '/api/session', { headers: { origin: base } }); assert.equal((await context.request.get(base + '/api/operations?company=KBA')).status(), 401); }
  const report = { testedAt: new Date().toISOString(), base, status: 'PASS', checks, modules: 19, javaScriptErrors: errors, viewports: ['1440x1000','390x844'] };
  writeFileSync(`artifacts/${cloud ? 'public-' : ''}ui-qa-v4.json`, JSON.stringify(report, null, 2));
} catch (e) { await page.screenshot({ path: 'data/ui-qa-v4/failure.png', fullPage: false }); throw e; }
finally { await browser.close(); }
