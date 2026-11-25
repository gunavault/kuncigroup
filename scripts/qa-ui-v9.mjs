/** Read-only KBA PAT; optional form save is restricted to local DEMO and restores its prior draft. */
import 'dotenv/config';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
const base=process.env.UI_URL??'http://127.0.0.1:3002', cloud=new URL(base).protocol==='https:';
const folder=`data/ui-qa-v9/${cloud?'cloud':'local'}`;mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const checks=[],errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const get=async path=>{const response=await context.request.get(base+path);assert.equal(response.status(),200,path);return response.json();};
try{
  const login=cloud?{email:'admin@kuncigroup.cloud',password:process.env.APP_PASSWORD||readFileSync('data/kunci-cloud-access.txt','utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim()}:JSON.parse(readFileSync('data/qa-v7-login.json','utf8'));
  assert.equal((await context.request.post(base+'/api/session',{headers:{origin:base},data:login})).status(),200,'login');
  const state=await get('/api/operations?company=KBA'),erp=await get('/api/erp?company=KBA');
  await check('dashboard memakai angka buku besar dan tautan penelusuran, impor tetap terpisah',async()=>{
    assert.equal(state.ledgerOverview.available,true);assert.equal(state.ledgerOverview.revenue,erp.report.revenue);
    await page.goto(base+'/?company=KBA');await page.getByText('Pendapatan buku besar',{exact:true}).waitFor();
    assert.equal(await page.locator('.ops-kpis a').count(),3);await page.screenshot({path:folder+'/dashboard.png'});
    await page.locator('.ops-kpis a').nth(1).click();await page.getByRole('tab',{name:'Piutang & utang'}).waitFor();
  });
  const report=await get('/api/service-report?'+new URLSearchParams({company:'KBA',period:erp.period.id}));
  await check('siklus jasa: rekonsiliasi, enam tab, pencarian, formulir tambah/hapus dan sumber belum tersedia',async()=>{
    assert.equal(report.aging.ar.ledger,state.ledgerOverview.receivable);
    if(report.workingPaper.available){await page.getByRole('region',{name:'Umur piutang kertas kerja'}).waitFor();await page.getByLabel('Cari invoice sumber').fill('__QA_NO_SUCH_INVOICE__');await page.getByLabel('Cari invoice sumber').fill('');}
    await page.getByLabel('Cari invoice/pihak').fill('__QA_NO_SUCH_INVOICE__');
    await page.getByLabel('Kelompok jatuh tempo').selectOption('UNKNOWN');
    await page.getByLabel('Jenis aging').selectOption('ap');
    const tabs=page.getByRole('tab');assert.equal(await tabs.count(),6);
    for(let i=0;i<6;i++){await tabs.nth(i).click();assert.equal(await tabs.nth(i).getAttribute('aria-selected'),'true');}
    await page.getByRole('tab',{name:'Profitabilitas site'}).click();
    await page.getByRole('button',{name:'Tambah alokasi analitis'}).click();await page.locator('.service-plan-row select').first().waitFor();
    await page.getByRole('button',{name:'Hapus alokasi'}).last().click();
    await page.getByRole('tab',{name:'Anggaran',exact:true}).click();await page.getByRole('button',{name:'Tambah anggaran'}).click();
    await page.getByLabel('Rujukan RAB/RAP').last().fill('Rujukan fixture antarmuka');await page.getByRole('button',{name:'Hapus baris rencana'}).last().click();
    await page.getByRole('tab',{name:'Rencana kas'}).click();await page.getByRole('button',{name:'Tambah rencana kas'}).click();await page.getByRole('button',{name:'Hapus baris rencana'}).last().click();
    await page.getByRole('tab',{name:'CaLK & kebijakan'}).click();assert.equal(await page.locator('.service-report textarea').count(),9);
    await page.screenshot({path:folder+'/calk-desktop.png'});
  });
  await check('ekspor siklus jasa Excel dan PDF valid serta mempertahankan nominal akun kontrol',async()=>{
    const query=new URLSearchParams({company:'KBA',period:erp.period.id,report:'service',format:'xlsx'});
    const response=await context.request.get(base+'/api/export?'+query);assert.equal(response.status(),200);
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await response.body());assert.equal(wb.worksheets.length,report.workingPaper.available?14:8);
    assert.equal(wb.getWorksheet('Rekonsiliasi AR AP').getCell('C2').value,report.aging.ar.ledger??'Belum tersedia');
    query.set('format','pdf');const pdf=await context.request.get(base+'/api/export?'+query);assert.equal(pdf.status(),200);assert.equal((await pdf.body()).subarray(0,4).toString(),'%PDF');
  });
  await check('19 modul: 4–6 kartu, filter cabang dan pencarian tetap terikat hak akses',async()=>{
    assert.equal(state.modules.length,19);
    for(const m of state.modules){
      const cards=await get('/api/operations?'+new URLSearchParams({company:'KBA',view:'module-kpis',module:m.key}));assert.ok(cards.cards.length>=4&&cards.cards.length<=6,m.key);
      await page.goto(base+(m.key==='accounting'?'/accounting?company=KBA':'/?'+new URLSearchParams({company:'KBA',module:m.key})));
      await page.locator(`.module-mini-dashboard[data-module="${m.key}"][aria-busy="false"]`).waitFor();assert.equal(await page.locator('.module-mini-card').count(),cards.cards.length,m.key);
    }
    const inventory=await get('/api/operations?company=KBA&view=module-kpis&module=inventory');assert.ok(inventory.cards.some(c=>c.key==='sourceStock'&&Number(c.value)>0));
    const branch=await get('/api/operations?'+new URLSearchParams({company:'KBA',branch:state.branches[0].id}));assert.equal(branch.ledgerOverview.eligible,false);
    const missing=await get('/api/operations?company=KBA&view=module-kpis&module=sales&q=__QA_MISSING__');assert.equal(missing.cards.find(c=>c.key==='total').value,'0');
  });
  await check('ponsel: semua kartu dan keenam tab laporan jasa tidak melampaui lebar layar',async()=>{
    await page.setViewportSize({width:390,height:844});
    for(const m of state.modules){await page.goto(base+(m.key==='accounting'?'/accounting?company=KBA':'/?'+new URLSearchParams({company:'KBA',module:m.key})));await page.locator('.module-mini-dashboard[aria-busy="false"]').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),m.key);}
    await page.goto(base+'/accounting?company=KBA&view=service');await page.getByRole('tab').first().waitFor();
    for(let i=0;i<6;i++){await page.getByRole('tab').nth(i).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'service tab '+i);}
    await page.screenshot({path:folder+'/calk-mobile.png'});
  });
  await check('permintaan lintas perusahaan, CSRF dan finalisasi tanpa bukti ditolak',async()=>{
    assert.ok((await context.request.get(base+'/api/service-report?company=KCG&period='+erp.period.id)).status()>=400);
    assert.ok((await context.request.post(base+'/api/service-report',{headers:{origin:'https://untrusted.invalid'},data:{companyId:'KBA'}})).status()>=400);
    const final=await get('/api/operations?company=KBA&view=finalization&period='+erp.period.id);assert.equal(final.state,'DRAFT');assert.equal(final.signoffs.length,0);assert.ok(final.checks.find(c=>c.key==='framework'&&!c.ok));
  });
  if(process.env.UI_WRITE_DEMO==='1')await check('lokal DEMO: simpan draft CaLK dan pulihkan isi awal melalui API',async()=>{
    assert.ok(!cloud&&['127.0.0.1','localhost'].includes(new URL(base).hostname),'local DEMO only');
    const demo=await get('/api/erp?company=DEMO'),before=await get('/api/service-report?company=DEMO&period='+demo.period.id);assert.equal(before.period.status,'OPEN');
    await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/accounting?company=DEMO&view=service');await page.getByRole('tab',{name:'CaLK & kebijakan'}).click();
    await page.getByLabel('Dasar penyusunan dan kebijakan akuntansi',{exact:true}).fill('SIMULASI QA antarmuka; draft ini dipulihkan setelah pengujian.');
    try{await page.getByRole('button',{name:'Simpan draft CaLK'}).click();await page.getByRole('status').getByText(/Draft catatan\/rencana tersimpan/).waitFor();}
    finally{const after=await get('/api/service-report?company=DEMO&period='+demo.period.id);const {version,framework,frameworkEvidence,notes,budgets,cashPlans,allocations}=before.plan;void version;
      const restore=await context.request.post(base+'/api/service-report',{headers:{origin:base},data:{companyId:'DEMO',periodId:demo.period.id,version:after.plan.version,framework,frameworkEvidence,notes,budgets,cashPlans,allocations}});assert.equal(restore.status(),200,'restore prior DEMO draft');}
  });
  assert.deepEqual(errors,[]);writeFileSync(folder+'/result.json',JSON.stringify({testedAt:new Date().toISOString(),base,status:'PASS',checks,modules:19,javaScriptErrors:errors,viewports:['1440x1000','390x844']},null,2));
}catch(e){await page.screenshot({path:folder+'/failure.png'}).catch(()=>{});writeFileSync(folder+'/failure.json',JSON.stringify({checks,error:String(e),javaScriptErrors:errors},null,2));throw e;}
finally{await context.request.delete(base+'/api/session',{headers:{origin:base}}).catch(()=>{});await browser.close();}
