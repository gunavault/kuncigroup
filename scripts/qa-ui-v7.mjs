/** Read-only production PAT. Optional draft/UI mutations are restricted to local DEMO. */
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
const base = process.env.UI_URL ?? 'http://127.0.0.1:3002', cloud = new URL(base).protocol === 'https:';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), errors = [], checks = [];
const folder = `data/ui-qa-v7/${cloud ? 'cloud' : 'local'}`;
mkdirSync(folder, { recursive: true }); page.setDefaultTimeout(45000);
page.on('pageerror', e => errors.push(e.message));
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
try {
  const login = cloud ? { email: 'admin@kuncigroup.cloud', password: process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim() } : JSON.parse(readFileSync('data/qa-v7-login.json', 'utf8'));
  const sign = await context.request.post(base + '/api/session', { headers: { origin: base }, data: { email: login.email, password: login.password } }); assert.equal(sign.status(), 200, 'login');
  const raw = await context.request.get(base + '/api/erp?company=KBA'); assert.equal(raw.status(), 200); const erp = await raw.json();
  await check('neraca, arus kas dan jurnal historis tetap seimbang', async () => {
    assert.ok(erp.journals.length >= 2002); assert.equal(erp.report.balanceDifference, '0.00'); assert.equal(erp.report.cash.difference, '0.00'); assert.equal(erp.report.trialDebit, erp.report.trialCredit);
  });
  await page.goto(base + '/accounting?company=KBA');
  await check('laporan dapat ditelusuri turun dan naik melalui akun, jurnal dan sumber', async () => {
    await page.getByRole('button', { name: /Laporan keuangan/ }).click();
    await page.locator('.statement').filter({ hasText: 'Laporan laba rugi' }).getByRole('button', { name: 'Pendapatan', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Telusur laporan → bukti sumber' });
    await dialog.getByText('Akun buku besar', { exact: true }).waitFor();
    await dialog.locator('tbody button.trace-link').first().click();
    await dialog.getByText(/Jurnal pembentuk/).waitFor();
    await dialog.locator('tbody button.trace-link').first().click();
    await dialog.getByText('Jejak sumber jurnal', { exact: true }).waitFor();
    assert.ok((await dialog.getByText(/sheet .*baris/).count()) > 0);
    await page.screenshot({ path: folder + '/trace-journal.png' });
    await dialog.getByRole('button', { name: 'Naik satu tingkat' }).click();
    await dialog.getByText(/Jurnal pembentuk/).waitFor();
    await dialog.locator('.trace-breadcrumb button').first().click();
    await dialog.getByText('Akun buku besar', { exact: true }).waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  });
  await check('rasio menampilkan formula, keterbatasan, drill-down dan ekspor Excel/PDF', async () => {
    const region = page.getByRole('region', { name: 'Rasio keuangan dan operasional' }); await region.locator('.ratio-card').first().waitFor();
    assert.ok(await region.locator('.ratio-card').count() >= 18);
    const ratio = region.locator('.ratio-card').filter({ hasText: 'Margin laba bersih' }); await ratio.locator('summary').click(); await ratio.getByRole('button', { name: 'Telusuri komponen buku besar' }).click();
    await page.getByRole('dialog').getByText('Akun buku besar', { exact: true }).waitFor(); await page.keyboard.press('Escape');
    for (const report of ['', 'management']) {
      const response = await context.request.get(`${base}/api/export?${new URLSearchParams({ company: 'KBA', period: erp.period.id, format: 'xlsx', ...(report ? { report } : {}) })}`); assert.equal(response.status(), 200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await response.body());
      const sheet = workbook.getWorksheet('Rasio'); assert.ok(sheet); assert.ok(sheet.rowCount >= 19); assert.equal(sheet.getRow(1).getCell(3).value, 'Nilai');
    }
    const pdf = await context.request.get(`${base}/api/export?company=KBA&period=${erp.period.id}&format=pdf`); assert.equal(pdf.status(), 200); assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
    await page.screenshot({ path: folder + '/financial-ratios.png', fullPage: true });
  });
  await check('finalisasi, pembatasan periode dan kesalahan permintaan ditangani', async () => {
    await page.getByRole('button', { name: /Laporan manajemen/ }).click();
    await page.getByRole('region', { name: 'Finalisasi laporan' }).waitFor();
    const status = await (await context.request.get(`${base}/api/operations?company=KBA&view=finalization&period=${erp.period.id}`)).json();
    assert.equal(status.state, 'DRAFT'); assert.ok(status.blockersForClose.length); assert.equal(status.signoffs.length, 0);
    const wrong = await context.request.get(`${base}/api/financial-trace?company=KCG&period=${erp.period.id}`); assert.ok(wrong.status() >= 400);
    const malformed = await context.request.get(`${base}/api/financial-trace?company=KBA&period=${erp.period.id}&page=-1`); assert.equal(malformed.status(), 400);
    const csrf = await context.request.post(base + '/api/erp', { headers: { origin: 'https://untrusted.invalid' }, data: { action: 'close', periodId: erp.period.id } }); assert.ok(csrf.status() >= 400);
  });
  await check('ponsel 390px: kartu rasio, modal, breadcrumb dan navigasi tetap dapat digunakan', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const financial = page.getByRole('button', { name: /Laporan keuangan/ }); if (!await financial.isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await financial.click(); await page.locator('.ratio-card').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('.statement').filter({ hasText: 'Arus kas' }).getByRole('button', { name: 'Operasional', exact: true }).click();
    await page.getByRole('dialog').getByText('Akun buku besar', { exact: true }).waitFor();
    assert.ok(await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
    await page.screenshot({ path: folder + '/mobile-trace.png' }); await page.keyboard.press('Escape');
  });
  assert.deepEqual(errors, []);
  await context.request.delete(base + '/api/session', { headers: { origin: base } }); assert.equal((await context.request.get(base + '/api/financial-ratios?company=KBA&period=' + erp.period.id)).status(), 401);
  writeFileSync(folder + '/result.json', JSON.stringify({ testedAt: new Date().toISOString(), base, status: 'PASS', checks, javaScriptErrors: errors }, null, 2));
} catch (error) { await page.screenshot({ path: folder + '/failure.png', fullPage: false }); throw error; }
finally { await browser.close(); }
