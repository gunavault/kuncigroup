// v9 browser QA (read-only): dashboard cards backed by the ledger, the service-cycle report with
// working-paper analyses (site P&L, invoice ageing, payables, cash projection, payroll test) and
// provisional ratios. UI_URL=http://127.0.0.1:3005 node scripts/qa-ui-v9.mjs  (or the cloud URL)
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
const base = process.env.UI_URL ?? 'http://127.0.0.1:3005', cloud = new URL(base).protocol === 'https:';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [];
const folder = `data/ui-qa-v9/${cloud ? 'cloud' : 'local'}`;
mkdirSync(folder, { recursive: true }); page.setDefaultTimeout(180000);
page.on('pageerror', (e) => errors.push(e.message));
const check = async (name, fn) => { await fn(); console.log('PASS', name); };
const nonZeroRupiah = (t) => /Rp\s?[1-9]/.test(t) || /Rp\s?-?\d{1,3}(\.\d{3})+/.test(t.replace(/Rp\s?0,00/g, ''));
try {
  const login = cloud
    ? { email: 'admin@kuncigroup.cloud', password: process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim() }
    : existsSync('data/qa-v7-login.json') ? JSON.parse(readFileSync('data/qa-v7-login.json', 'utf8')) : null;
  if (login) assert.equal((await context.request.post(base + '/api/session', { headers: { origin: base }, data: login })).status(), 200, 'login');
  const erp = await (await context.request.get(base + '/api/erp?company=KBA')).json();
  const svc = await (await context.request.get(`${base}/api/service-report?company=KBA&period=${erp.period.id}`)).json();
  await check('service report API: working-paper analyses reconcile to the ledger', async () => {
    const wp = svc.workingPaper;
    assert.equal(wp.available, true);
    assert.equal(wp.sites.difference, '0.00', 'site P&L equals ledger P&L');
    assert.ok(wp.sites.rows.length >= 3);
    assert.equal(wp.receivables.difference, '0.00', 'open invoices equal the receivable control account');
    assert.ok(wp.receivables.open.length >= 1);
    assert.ok(wp.payables.summary.length >= 1 && wp.cashProjection.rows.length >= 5 && wp.laborTest.rows.length >= 3);
    assert.notEqual(svc.labor.cost, null, 'labour cost shown (provisional until Finance review)');
    assert.ok(wp.budgets.sites.length >= 1 && wp.budgets.sites.every((b) => b.months > 0), 'RAB budgets per invoiced site');
  });
  await check('operations dashboard shows ledger revenue, receivable and cash-advance balances', async () => {
    await page.goto(base + '/?company=KBA');
    await page.getByText('Pendapatan buku besar').first().waitFor();
    const kpis = await page.locator('.ops-kpis').innerText();
    for (const label of ['Pendapatan buku besar', 'Piutang buku besar'])
      assert.match(kpis, new RegExp(String.raw`${label}\s+Rp\s?[1-9]`), `${label} is not zero`);
    // The cash-advance control account has no 2026 movement: a proven zero, shown with its account and basis.
    assert.match(kpis, /Saldo akun kasbon\s+Rp\s?0,00\s+11102/);
    await page.screenshot({ path: `${folder}/operations-dashboard.png` });
  });
  await check('sales module cards use the control account and explain imported documents', async () => {
    const r = await (await context.request.get(`${base}/api/operations?company=KBA&view=module-kpis&module=sales`)).json();
    const card = r.cards.find((c) => c.key === 'outstanding');
    assert.ok(card && card.value !== null && card.value !== '0.00', 'receivable control account balance');
    assert.match(r.sourceNote ?? '', /dokumen impor/);
    const inv = await (await context.request.get(`${base}/api/operations?company=KBA&view=module-kpis&module=inventory`)).json();
    assert.ok(inv.cards.some((c) => c.key === 'sourceStock' && Number(c.value) > 0), 'stock source rows counted');
  });
  await check('service-cycle page renders every tab with working-paper evidence', async () => {
    await page.goto(`${base}/accounting?company=KBA&view=service`);
    await page.getByRole('region', { name: 'Umur piutang kertas kerja' }).waitFor();
    await page.getByRole('region', { name: 'Utang usaha kertas kerja' }).waitFor();
    await page.screenshot({ path: `${folder}/service-aging.png`, fullPage: true });
    for (const [tab, region] of [['Profitabilitas site', 'Profitabilitas site kertas kerja'], ['Biaya jasa & stok', 'Uji beban tenaga kerja kertas kerja'], ['Anggaran', 'Anggaran RAB per site'], ['Rencana kas', 'Proyeksi kas kertas kerja']]) {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByRole('region', { name: region }).waitFor();
      await page.screenshot({ path: `${folder}/service-${tab.split(' ')[0].toLowerCase()}.png`, fullPage: true });
    }
    await page.getByRole('tab', { name: 'CaLK & kebijakan' }).click();
    await page.getByText('Dasar penyusunan').first().waitFor();
  });
  await check('ratios show provisional values instead of blanks while the mapping awaits review', async () => {
    const r = await (await context.request.get(`${base}/api/financial-ratios?company=KBA&period=${erp.period.id}`)).json();
    const current = r.ratios.find((x) => x.key === 'current');
    assert.notEqual(current.value, null);
    if (r.mappingPending) assert.equal(current.provisional, true);
    await page.goto(base + '/accounting?company=KBA');
    await page.getByRole('button', { name: /Laporan keuangan/ }).click();
    await page.getByRole('region', { name: 'Rasio keuangan dan operasional' }).waitFor();
    if (r.mappingPending) await page.getByText('SEMENTARA').first().waitFor();
  });
  await check('closing stage shows the post-closing trial balance from the closing preview', async () => {
    await page.goto(base + '/accounting?company=KBA');
    await page.getByRole('button', { name: /Tutup buku/ }).click();
    await page.getByRole('button', { name: /Pratinjau jurnal penutup/ }).click();
    const tb = page.getByRole('region', { name: 'Neraca saldo penutup' });
    await tb.waitFor();
    assert.match(await tb.innerText(), /Seluruh akun nominal bersaldo nol[\s\S]*seimbang/);
  });
  await check('phone width keeps the service report usable', async () => {
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(`${base}/accounting?company=KBA&view=service`);
    await phone.getByRole('region', { name: 'Umur piutang kertas kerja' }).waitFor();
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `no horizontal page scroll (${overflow}px)`);
    await phone.screenshot({ path: `${folder}/service-phone.png` });
    await phone.close();
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
} finally {
  await browser.close();
}
