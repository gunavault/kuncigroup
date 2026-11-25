// Evidence-backed correcting journals for KBA (working-paper period), posted through the app API
// so authorisation, balance rules and the audit trail apply exactly as for Finance input.
//   BASE_URL=http://127.0.0.1:3000 node scripts/post-corrections-v7.mjs [--apply]
//   BASE_URL=https://<cloud> node scripts/post-corrections-v7.mjs [--apply]   (APP_PASSWORD or data/kunci-cloud-access.txt)
// Idempotent: a correction whose marker is already in a journal description is skipped.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const apply = process.argv.includes('--apply');
const headers = { origin: base, 'Content-Type': 'application/json' };
if (base.startsWith('https:')) {
  const password = process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt', 'utf8').match(/^Password aplikasi: (.+)$/m)[1].trim();
  const r = await fetch(base + '/api/session', { method: 'POST', headers, body: JSON.stringify({ email: 'admin@kuncigroup.cloud', password }) });
  if (r.status !== 200) throw new Error('login gagal');
  headers.cookie = r.headers.getSetCookie()[0].split(';')[0];
}
const get = async (p) => { const r = await fetch(base + p, { headers }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const erp = await get('/api/erp?company=KBA');
if (!/Oktober 2026/.test(erp.period.name)) throw new Error('Periode kertas kerja tidak ditemukan');
const { accounts } = await get('/api/operations?company=KBA&view=accounts');
const acc = (code) => { const a = accounts.find((x) => x.code === code); if (!a) throw new Error('Akun ' + code + ' tidak ada'); return a.id; };

// Corrections are kept outside the public repository (data/corrections-v7.json, git-ignored):
// [{ marker, date, description (cites evidence), lines: [{ accountCode, debit, credit, description }] }]
const file = process.env.CORRECTIONS_FILE ?? 'data/corrections-v7.json';
const corrections = JSON.parse(readFileSync(file, 'utf8')).map((c) => ({ ...c, lines: c.lines.map((l) => ({ accountId: acc(l.accountCode), debit: l.debit, credit: l.credit, description: l.description })) }));

const existing = erp.journals.map((j) => j.description);
const results = [];
for (const c of corrections) {
  if (existing.some((d) => d.startsWith(c.marker))) { results.push({ marker: c.marker, status: 'SUDAH_ADA' }); continue; }
  const debit = c.lines.reduce((s, l) => s + Number(l.debit), 0), credit = c.lines.reduce((s, l) => s + Number(l.credit), 0);
  if (debit !== credit) throw new Error(c.marker + ' tidak seimbang');
  if (!apply) { results.push({ marker: c.marker, status: 'DRY_RUN', amount: debit }); continue; }
  const r = await fetch(base + '/api/erp', { method: 'POST', headers, body: JSON.stringify({ action: 'journal', data: {
    periodId: erp.period.id, date: c.date, type: 'ADJUSTING', status: 'POSTED', cashActivity: 'FINANCING', description: c.description, lines: c.lines } }) });
  const body = await r.json();
  if (!r.ok) throw new Error(`${c.marker}: ${body.error}`);
  results.push({ marker: c.marker, status: 'POSTED', journal: body.result.journalNumber, amount: debit });
}
console.log(JSON.stringify({ base, mode: apply ? 'APPLY' : 'DRY_RUN', period: erp.period.name, results }, null, 2));
if (headers.cookie) await fetch(base + '/api/session', { method: 'DELETE', headers });
