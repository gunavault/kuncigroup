import 'dotenv/config';
import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { amount,cents,validateLines } from '../src/lib/money';
const schema=`test_${randomUUID().replaceAll('-','')}`;
const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('schema',schema);process.env.DATABASE_URL=url.toString();
const client=new pg.Client({connectionString:url.toString()});await client.connect();await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET search_path TO "${schema}"`);
for(const dir of readdirSync('prisma/migrations').filter(d=>/^\d/.test(d)))await client.query(readFileSync(`prisma/migrations/${dir}/migration.sql`,'utf8').replace(/^\uFEFF/,''));
const {db}=await import('../src/lib/db');
const {createJournal,snapshot,previewClosing,closePeriod,reverseJournal,postDraft,saveAccount,deleteAccount,insert}=await import('../src/lib/accounting');
await test('PostgreSQL accounting integration',async t=>{
t.after(async()=>{await db.$disconnect();await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();});
const L=(accountId:string,debit:string,credit:string)=>({accountId,debit,credit});
const base={periodId:'dec',date:'2026-12-15',type:'GENERAL',description:'Integration test',cashActivity:'OPERATING'};
async function seed(){await db.$transaction(async tx=>{
for(const [code,name,category,role]of [['111','Kas','ASET',null],['112','Piutang','ASET',null],['113','Perlengkapan','ASET',null],['211','Utang','KEWAJIBAN',null],['311','Modal','EKUITAS','CAPITAL'],['312','Prive','EKUITAS','DRAWINGS'],['399','Ikhtisar','EKUITAS','INCOME_SUMMARY'],['411','Pendapatan','PENDAPATAN',null],['511','Listrik','BEBAN',null],['512','Beban lain','BEBAN',null]] as const)await tx.account.create({data:{id:code,code,name,category,role,isSystemAccount:!!role,isCash:code==='111',normalBalance:category==='ASET'||category==='BEBAN'?'DEBIT':'KREDIT'}});
await tx.fiscalPeriod.create({data:{id:'dec',name:'Desember 2026',startDate:new Date('2026-12-01Z'),endDate:new Date('2026-12-31Z')}});
await insert(tx,'dec',new Date('2026-12-01Z'),'OPENING','Saldo simulasi',[L('111','900','0'),L('112','1800','0'),L('211','0','1500'),L('311','0','2400'),L('512','1200','0')]);
for(const [a,b,n]of [['111','411','2500'],['113','111','400'],['511','111','350'],['111','112','1200'],['211','111','900']])await insert(tx,'dec',new Date('2026-12-12Z'),'GENERAL','Transaksi simulasi',[L(a,n,'0'),L(b,'0',n)],{cashActivity:'OPERATING'});
},{timeout:30000});}
await t.test('precision and validation',()=>{assert.equal(amount(cents('0.10')+cents('0.20')),'0.30');assert.equal(amount(cents('9999999999999.99')),'9999999999999.99');for(const value of ['NaN','1e3','1.001','-1','1,2','10000000000000'])assert.throws(()=>cents(value));assert.throws(()=>validateLines([L('111','1','0')]));assert.throws(()=>validateLines([L('111','1','1'),L('411','0','1')]));});
await seed();
await t.test('all expected superprompt figures reconcile',async()=>{const {report:r}=await snapshot('dec');for(const [key,value]of Object.entries({trialDebit:'5500.00',trialCredit:'5500.00',revenue:'2500.00',expense:'1550.00',profit:'950.00',equity:'3350.00',assets:'3950.00',liabilities:'600.00',balanceDifference:'0.00'}))assert.equal(r[key as keyof typeof r],value,key);assert.equal(r.cash.ending,'2950.00');assert.equal(r.cash.operating,'2050.00');assert.equal(r.cash.difference,'0.00');});
await t.test('unbalanced journal rolls back without sequence changes',async()=>{const before=await db.fiscalPeriod.findUniqueOrThrow({where:{id:'dec'}});await assert.rejects(createJournal({...base,lines:[L('111','10','0'),L('411','0','9')]}));assert.equal((await db.fiscalPeriod.findUniqueOrThrow({where:{id:'dec'}})).sequence,before.sequence);});
await t.test('direct SQL cannot persist unbalanced or empty journal',async()=>{await assert.rejects(db.$transaction(async tx=>{await tx.journalEntry.create({data:{id:'bad',journalNumber:'BAD',fiscalPeriodId:'dec',type:'GENERAL',status:'DRAFT',description:'bad',transactionDate:new Date('2026-12-01Z'),lines:{create:[L('111','5','0'),L('411','0','4')]}}});}));assert.equal(await db.journalEntry.count({where:{id:'bad'}}),0);});
await t.test('posted headers and lines cannot be edited or deleted',async()=>{const e=await db.journalEntry.findFirstOrThrow({where:{type:'GENERAL'},include:{lines:true}});await assert.rejects(db.journalEntry.update({where:{id:e.id},data:{description:'tampered'}}));await assert.rejects(db.journalEntry.delete({where:{id:e.id}}));await assert.rejects(db.journalLine.update({where:{id:e.lines[0].id},data:{debit:'2'}}));});
await t.test('invalid period dates and repeated opening are rejected',async()=>{await assert.rejects(createJournal({...base,date:'2027-01-01',lines:[L('111','1','0'),L('411','0','1')]}));await assert.rejects(createJournal({...base,type:'OPENING',lines:[L('111','1','0'),L('311','0','1')]}));});
await t.test('cash movement requires explicit activity',async()=>{await assert.rejects(createJournal({...base,cashActivity:undefined,lines:[L('111','1','0'),L('411','0','1')]}));});
await t.test('draft is balanced, excluded from reports, and posts once',async()=>{const before=(await snapshot('dec')).report.profit;const e=await createJournal({...base,status:'DRAFT',lines:[L('111','0.30','0'),L('411','0','0.30')]});assert.equal((await snapshot('dec')).report.profit,before);await assert.rejects(closePeriod('dec'));await postDraft(e.id);await assert.rejects(postDraft(e.id));await reverseJournal(e.id,'dec','2026-12-16');assert.equal((await snapshot('dec')).report.profit,before);await assert.rejects(reverseJournal(e.id,'dec','2026-12-17'));});
await t.test('concurrent journals have unique sequence numbers',async()=>{const entries=await Promise.all([1,2,3].map(()=>createJournal({...base,lines:[L('113','0.01','0'),L('211','0','0.01')]})));assert.equal(new Set(entries.map(e=>e.journalNumber)).size,3);for(const e of entries)await reverseJournal(e.id,'dec','2026-12-17');});
await t.test('adjustments update worksheet and reverse without residual cents',async()=>{const e=await createJournal({...base,type:'ADJUSTING',lines:[L('511','25.23','0'),L('113','0','25.23')]});const r=(await snapshot('dec')).report;assert.equal(r.rows.find(a=>a.code==='511')!.adjustment,'25.23');assert.equal(r.profit,'924.77');await reverseJournal(e.id,'dec','2026-12-18');assert.equal((await snapshot('dec')).report.profit,'950.00');});
await t.test('COA CRUD and used/system protections',async()=>{const a=await saveAccount({code:'599',name:'Akun uji',category:'BEBAN'});assert.equal(a.normalBalance,'DEBIT');await saveAccount({id:a.id,code:'599',name:'Akun uji baru',category:'BEBAN'});await deleteAccount(a.id);await assert.rejects(deleteAccount('111'));await assert.rejects(saveAccount({id:'311',code:'311',name:'Tampered',category:'ASET'}));});
await t.test('closing preview creates three balanced entries without writes',async()=>{const count=await db.journalEntry.count();const plan=await previewClosing('dec');assert.equal(plan.groups.length,3);plan.groups.forEach(g=>validateLines(g.lines));assert.equal(await db.journalEntry.count(),count);});
await t.test('close is atomic, locks period, preserves historical profit and carries permanent balances',async()=>{const next=await closePeriod('dec');assert.equal(next.startDate.toISOString().slice(0,10),'2027-01-01');assert.equal((await snapshot('dec')).period.status,'CLOSED');assert.equal((await snapshot('dec')).report.profit,'950.00');const r=(await snapshot(next.id)).report;assert.equal(r.profit,'0.00');assert.equal(r.equity,'3350.00');assert.equal(r.assets,'3950.00');assert.equal(r.cash.ending,'2950.00');assert.equal(r.balanceDifference,'0.00');await assert.rejects(closePeriod('dec'));await assert.rejects(createJournal({...base,lines:[L('111','1','0'),L('411','0','1')]}));await assert.rejects(db.fiscalPeriod.update({where:{id:'dec'},data:{status:'OPEN'}}));});
await t.test('loss and drawings close with correct signs and carry no temporary balances',async()=>{
 const p=(await snapshot()).period;const pid=p.id;const d=p.startDate.toISOString().slice(0,10);
 await createJournal({...base,periodId:pid,date:d,description:'Loss scenario',type:'GENERAL',lines:[L('511','1000','0'),L('111','0','1000')]});
 await createJournal({...base,periodId:pid,date:d,description:'Prive scenario',type:'GENERAL',cashActivity:'FINANCING',lines:[L('312','100','0'),L('111','0','100')]});
 const r=(await snapshot(pid)).report;assert.equal(r.profit,'-1000.00');assert.equal(r.equity,'2250.00');assert.equal(r.balanceDifference,'0.00');assert.equal(r.cash.financing,'-100.00');
 const plan=await previewClosing(pid);assert.equal(plan.groups.length,3);plan.groups.forEach(g=>validateLines(g.lines));const next=await closePeriod(pid);const n=(await snapshot(next.id)).report;assert.equal(n.profit,'0.00');assert.equal(n.drawings,'0.00');assert.equal(n.equity,'2250.00');assert.equal(n.cash.ending,'1850.00');assert.equal(n.balanceDifference,'0.00');
});
await t.test('calendar-invalid dates are rejected before database writes',async()=>{const pid=(await snapshot()).period.id;await assert.rejects(createJournal({...base,periodId:pid,date:'2027-02-30',lines:[L('111','1','0'),L('411','0','1')]}));});
await t.test('closing reuses an already-open following month for its opening balance',async()=>{
 await db.fiscalPeriod.create({data:{id:'h-jan',name:'Jan 2030',startDate:new Date('2030-01-01Z'),endDate:new Date('2030-01-31Z')}});
 await db.fiscalPeriod.create({data:{id:'h-feb',name:'Feb 2030',startDate:new Date('2030-02-01Z'),endDate:new Date('2030-02-28Z')}});
 await createJournal({...base,periodId:'h-jan',date:'2030-01-10',lines:[L('111','700','0'),L('411','0','700')]});
 const next=await closePeriod('h-jan');assert.equal(next.id,'h-feb','existing month is reused');
 const opening=await db.journalEntry.findFirstOrThrow({where:{fiscalPeriodId:'h-feb',type:'OPENING'},include:{lines:true}});
 assert.ok(opening.lines.length>0);
 await db.fiscalPeriod.create({data:{id:'m-jan',name:'Jan 2031',startDate:new Date('2031-01-01Z'),endDate:new Date('2031-01-31Z')}});
 await db.fiscalPeriod.create({data:{id:'m-odd',name:'Odd 2031',startDate:new Date('2031-02-15Z'),endDate:new Date('2031-03-14Z')}});
 await assert.rejects(closePeriod('m-jan'),/bertumpang tindih/,'a misaligned following period is still refused');
});
await t.test('audit is append only',async()=>{const a=await db.auditEvent.findFirstOrThrow();await assert.rejects(db.auditEvent.delete({where:{id:a.id}}));});

});
