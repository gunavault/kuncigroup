import {readWorkbook} from './workbook-reader.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=process.env.UPLOAD_ROOT??'C:/Users/M.S Dharma Siregar/Downloads/';
const names=['MASTER ABSENSI ALL PROJECT OKTOBER 2026.xlsx','Master Data Asset - Project.xlsx','Data Stock - Project.xlsx','Master Data Aset Head Office - KBA.xlsx','Database Resource KBA 17 Nov 2026.xlsx','Kertas_Kerja_Akuntansi_KBA_2026 (2).xlsx'];
const hash=s=>createHash('sha256').update(s).digest('hex');
export const norm=s=>String(s??'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
const text=v=>v===null||v===undefined?'':v instanceof Date?v.toISOString():String(v).trim();
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function isoDate(v){if(v instanceof Date&&v.getUTCFullYear()>1950)return v.toISOString().slice(0,10);if(typeof v==='string'){const m=/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v.trim());if(m){const s=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return new Date(s).toISOString().slice(0,10)===s?s:null;}}return null;}
export function time(v){if(v instanceof Date)return v.toISOString().slice(11,19);const s=text(v),m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);return m&&+m[1]<24&&+m[2]<60?`${m[1].padStart(2,'0')}:${m[2]}:${m[3]??'00'}`:null;}
const books=[];for(const name of names){const bytes=readFileSync(root+name),book=await readWorkbook(bytes);books.push({name,book,id:'upload-'+hash(bytes).slice(0,24),sha256:hash(bytes)});}
const accounts=[],masters=[],facts=[],issues=[],branches=[],files=books.map(({name,id,sha256,book})=>({id,name,sha256,rowCount:book.sheets.reduce((n,s)=>n+s.rows.length,0),sheets:book.sheets.map(s=>s.name),headers:Object.fromEntries(book.sheets.map(s=>[s.name,Object.fromEntries([...((s.rows.find(r=>r.number===4))?.cells.values()??[])].filter(c=>typeof c.value==='string'&&c.value.length<150).map(c=>[c.col,c.value]))]))}));
const batch='upload-20261118-'+hash(files.map(f=>f.sha256).join('')).slice(0,16);
const issue=(code,message,extra={})=>issues.push({code,message,...extra});
const add=(kind,key,name,data={},branch='HO',file=null,sheet='',row=0,active=true)=>{const m={key,kind,name:text(name),code:key.split(':').at(-1),data,branch,file:file?.id??null,sheet,row,active};if(!m.name)return null;const existing=masters.find(x=>x.key===key);if(existing)return existing;masters.push(m);return m;};
const fact=(kind,f,s,r,data,extra={})=>facts.push({key:`${f.id}:${s.name}:${r}:${kind}:${extra.column??0}`,kind,file:f.id,sheet:s.name,row:r,data,...extra});
const siteNames={HO:'Head Office',HLM:'Halim / Pandawa',GOR:'GOR Chandrabaga',KLH:'KLH',BONAS:'KLH Bonas',PLAZA:'KLH Plaza Kuningan',SKD:'SKD 17'};
for(const [code,name]of Object.entries(siteNames))branches.push({code,name});
const site=v=>{const n=norm(v);return /BONAS/.test(n)?'BONAS':/PLAZA|KLHKUNINGAN/.test(n)?'PLAZA':/SKD/.test(n)?'SKD':/GOR|STADION/.test(n)?'GOR':/KLH|LINGKUNGAN/.test(n)?'KLH':/HALIM|PANDAWA|GMF/.test(n)?'HLM':'HO';};
for(const code of Object.keys(siteNames))add('PROJECT','site:'+code,siteNames[code],{cluster:'CLEANING',sourceVerification:'PENDING',site:true},code);
// Resource roster: actual employee identifiers; no automatic accounts or privileged roles.
{
 const f=books[4],s=f.book.sheets.find(s=>s.name==='Sheet1'),ids=new Set();
 for(const r of s.rows){const n=r.number,id=text(s.value(n,2)),name=text(s.value(n,3));if(n<2||!/^\d{7}$/.test(id)||!name)continue;
  if(ids.has(id)){issue('EMPLOYEE_ID_DUPLICATE','ID karyawan berulang',{file:f.id,sheet:s.name,row:n});continue;}ids.add(id);
  const deploy=text(s.value(n,8)),branch=site(text(s.value(n,6))+' '+text(s.value(n,7))+' '+deploy),position=text(s.value(n,4)),resignedAt=isoDate(s.value(n,15));
  const roleSuggestion=/direktur/i.test(position)?'DIRECTOR':/manager/i.test(position)?'MANAGER':/staff|admin/i.test(position)?'STAFF':'EMPLOYEE';
  const m=add('EMPLOYEE','employee:'+id,name,{workId:id,position,region:text(s.value(n,5)),location:text(s.value(n,6)),payrollArea:text(s.value(n,7)),deploymentCode:deploy,department:text(s.value(n,9)),departmentRef:'department:'+norm(s.value(n,9)),positionRef:'position:'+norm(position),subdepartment:text(s.value(n,10)),category:text(s.value(n,11)),grade:text(s.value(n,12)),phone:text(s.value(n,13)),joinedAt:isoDate(s.value(n,14))??'',resignedAt:resignedAt??'',resignDateSource:text(s.value(n,15)),currentRoster:true,rosterVersion:'2026-11-17',roleSuggestion,affiliationReview:/^KC[G|H]-/.test(deploy),sourceVerification:'VERIFIED',projectRef:'site:'+branch},branch,f,s.name,n,!(resignedAt&&resignedAt<='2026-11-18'));
  add('DEPARTMENT','department:'+norm(m.data.department),m.data.department,{},'HO',f,s.name,n);
  add('POSITION','position:'+norm(position),position,{},'HO',f,s.name,n);
  if(m.data.affiliationReview)issue('EMPLOYER_UNCONFIRMED','Kode penempatan KCG/KCH bukan bukti perusahaan pemberi kerja',{file:f.id,sheet:s.name,row:n,target:m.key});
 }
}
const employees=masters.filter(x=>x.kind==='EMPLOYEE');
const matchEmployee=(name,branch)=>{const all=employees.filter(x=>norm(x.name)===norm(name));if(all.length===1)return all[0];const narrowed=all.filter(x=>x.branch===branch||branch==='KLH'&&['KLH','BONAS','PLAZA'].includes(x.branch));return narrowed.length===1?narrowed[0]:null;};
// Physical asset registers. Empty stock-opname and service templates do not create activity.
for(const index of [1,3]){
 const f=books[index],s=f.book.sheets.find(s=>s.name===(index===1?'Daftar Asset':'Master Aset'));
 for(const r of s.rows){const n=r.number,rawCode=text(s.value(n,2)),name=text(s.value(n,3));if(n<5||!name||!/^\d+$/.test(text(s.value(n,1)))||/total/i.test(rawCode+name))continue;const code=rawCode||'LOCAL-PROJ-'+n;
  const ho=index===3,location=text(s.value(n,ho?9:8)),serial=text(s.value(n,7)),q=ho?number(s.value(n,8))??1:1;
  add('ASSET','asset:'+code,name,{serial,barcode:code,sourceAssetCode:rawCode,identityReview:!rawCode,category:text(s.value(n,4)),brand:text(s.value(n,5)),model:text(s.value(n,6)),quantity:q,aggregate:q>1,location,custodian:text(s.value(n,ho?10:11)),condition:text(s.value(n,ho?11:13)),status:text(s.value(n,ho?12:14)),acquiredAt:ho?isoDate(s.value(n,13))??'':'',acquisitionYear:ho&&typeof s.value(n,13)==='number'?s.value(n,13):null,cost:ho?number(s.value(n,14)):null,stockOpnameDate:ho?isoDate(s.value(n,15)):null,remarks:text(s.value(n,ho?16:14)),destination:ho?'':text(s.value(n,9)),handoverReference:ho?'':text(s.value(n,12)),sourceVerification:'PENDING',physicalRegister:true},site(location),f,s.name,n);
 }
}
// Physical-stock source ledger: opening plus signed receipts/usage, distinct from live available lots.
{
 const f=books[2];for(const s of f.book.sheets){let closing=0;for(const r of s.rows.slice(0,5))for(const c of r.cells.values())if(norm(c.value)==='SISASTOK')closing=c.col;
  if(!closing){issue('STOCK_HEADER','Kolom sisa stok tidak ditemukan',{file:f.id,sheet:s.name});continue;}
  const branch=site(s.name),warehouse=add('WAREHOUSE','warehouse:'+branch,'Gudang '+siteNames[branch],{type:'SITE',projectRef:'site:'+branch,sourceVerification:'VERIFIED'},branch,f,s.name,3);
  for(const r of s.rows){const n=r.number,name=text(s.value(n,3)),uom=text(s.value(n,4));if(n<4||!name||!uom||!/^\d+$/.test(text(s.value(n,1))))continue;
   const p=add('PRODUCT','stock:'+hash(norm(name)+'|'+norm(uom)).slice(0,14),name,{type:'STOCK',uom,category:text(s.value(n,2)),sourceVerification:'VERIFIED'},'HO',f,s.name,n);
   const opening=number(s.value(n,5));let computed=opening===null?null:Math.round(opening*1000),last=null;const moves=[],warnings=[];
   for(let c=6;c<closing;c++){const v=number(s.value(n,c));if(v===null||v===0)continue;const label=text(s.value(2,c)),usage=/pakai/i.test(label);let date=isoDate(s.value(3,c))||isoDate(s.value(3,c-1));if(date&&(!last||date>last))last=date;const milli=Math.round(v*1000);if(computed!==null)computed+=milli;if(usage&&v>0)warnings.push('PEMAKAIAN_POSITIF');if(!usage&&v<0)warnings.push('PENERIMAAN_NEGATIF');if(!date)warnings.push('TANGGAL_MUTASI_KOSONG');moves.push({column:c,date,quantity:v,usage});}
   const sourceClosing=number(s.value(n,closing)),calculated=computed===null?null:computed/1000;if(sourceClosing===null||calculated===null||Math.abs(sourceClosing-calculated)>0.0005)warnings.push('SELISIH_REKONSILIASI');if(sourceClosing!==null&&sourceClosing<0)warnings.push('SALDO_NEGATIF');
   fact('STOCK_SNAPSHOT',f,s,n,{name,uom,opening,sourceClosing,calculated,movements:moves,warnings:[...new Set(warnings)],warehouseRef:warehouse.key,valuationStatus:'UNIT_COST_REQUIRED',basis:'Buku stok sumber; bukan hasil stock opname terverifikasi'}, {branch,projectRef:'site:'+branch,productRef:p.key,quantity:sourceClosing,effectiveDate:last,status:warnings.length?'REVIEW':'VALIDATED'});
  }
 }
}
// Attendance: raw scans retained separately. One primary fact per employee/day from each recap.
{
 const f=books[0],rawBySite=new Map(),gorNames=new Map();
 const gor=f.book.sheets.find(s=>s.name==='REKAP ABSENSI GOR OKTOBER 2026');
 for(const r of gor.rows){const id=text(gor.value(r.number,1)),name=text(gor.value(r.number,3)),job=text(gor.value(r.number,4));if(r.number>5&&id&&name&&job)gorNames.set(id,name);}
 for(const [sheet,branch,isGor]of [['Mentahan Finger Halim','HLM',false],['Master dari finger GOR','GOR',true],['Mentahan Finger KLH','KLH',false]]){
  const s=f.book.sheets.find(s=>s.name===sheet),list=[];
  for(const r of s.rows){const n=r.number,date=isoDate(s.value(n,isGor?6:7));if(!date)continue;const deviceId=text(s.value(n,isGor?2:1)),name=isGor?(gorNames.get(deviceId)??text(s.value(n,3))):text(s.value(n,3)),inTime=time(s.value(n,isGor?7:8)),outTime=time(s.value(n,isGor?8:10))??time(s.value(n,9));const e=matchEmployee(name,branch);const data={name,deviceId,inTime,outTime,matched:!!e,gpsStatus:'NOT_COLLECTED_HISTORICAL'};list.push({...data,date});fact('ATTENDANCE_SCAN',f,s,n,data,{branch,employeeRef:e?.key,effectiveDate:date,status:e?'VALIDATED':'UNMATCHED'});}
  rawBySite.set(branch,list);
 }
 for(const [sheet,branch,start,end,nameCol,jobCol,firstRow,headerRow]of [['REKAP ABSENSI HALIM OKT 2026','HLM',8,115,3,4,7,4],['REKAP ABSENSI GOR OKTOBER 2026','GOR',8,115,3,4,7,1],['REKAP ABSENSI OKTOBER KLH 2026','KLH',4,103,2,3,5,4]]){
  const s=f.book.sheets.find(s=>s.name===sheet),raw=rawBySite.get(branch),dates=[];
  for(let c=start;c<=end;c+=4){const header=s.value(headerRow,c);let date=isoDate(header);
   if(!date&&typeof header==='string'){const m=/(\d{1,2})\s+([A-Za-z]+)\s+(2026)/.exec(header);if(m){const month=/sep/i.test(m[2])?'09':/okt|oct/i.test(m[2])?'10':null;if(month)date=`2026-${month}-${m[1].padStart(2,'0')}`;}}
   if(!date&&branch==='KLH'){const firstDay=number(s.value(headerRow,start));if(firstDay===26){const expected=new Date(Date.UTC(2026,8,26)+(c-start)/4*86400000);if(expected.getUTCDate()===number(header))date=expected.toISOString().slice(0,10);}}
   dates.push({c,date});}
  if(branch==='KLH')issue('ATTENDANCE_TITLE_CONFLICT','Judul periode Juli berkonflik dengan label Oktober dan tanggal scan September–Oktober',{file:f.id,sheet:s.name});
  for(const r of s.rows){const n=r.number,name=text(s.value(n,nameCol)),position=text(s.value(n,jobCol));if(n<firstRow||!name||!position||/total|jumlah|jabatan|project manager/i.test(name))continue;const e=matchEmployee(name,branch);
   for(const {c,date}of dates){if(!date){issue('ATTENDANCE_DATE_MISSING','Tanggal harian tidak dapat ditentukan',{file:f.id,sheet:s.name,row:n,column:c});continue;}
    const values=[0,1,2,3].map(i=>s.value(n,c+i)),inFinger=time(values[0]),inManual=time(values[1]),outFinger=time(values[2]),outManual=time(values[3]),tokens=values.map(text).filter(x=>x&&!time(x)),code=tokens.find(t=>/^(OFF|X|A|I|S|C)$/i.test(t))?.toUpperCase()??null;
    const inTime=inManual??inFinger,outTime=outManual??outFinger,minutes=t=>t?+t.slice(0,2)*60 + +t.slice(3,5):null,warnings=[];
    if(!e)warnings.push('KARYAWAN_BELUM_DIPADANKAN');if(inTime&&outTime&&outTime<inTime)warnings.push('SHIFT_LINTAS_HARI_PERLU_VERIFIKASI');if(inFinger&&inManual&&Math.abs(minutes(inFinger)-minutes(inManual))>5||outFinger&&outManual&&Math.abs(minutes(outFinger)-minutes(outManual))>5)warnings.push('KOREKSI_WAKTU_LEBIH_5_MENIT');
    const scan=raw.find(x=>norm(x.name)===norm(name)&&x.date===date);if(scan&&inFinger&&scan.inTime&&inFinger!==scan.inTime)warnings.push('SCAN_BERBEDA');
    const attendanceStatus=code??(inTime&&outTime?'HADIR':inTime||outTime?'TIDAK_LENGKAP':'TIDAK_DIKETAHUI');
    fact('ATTENDANCE',f,s,n,{name,position,sourceValues:values.map(v=>v instanceof Date?time(v):v),inFinger,inManual,outFinger,outManual,inTime,outTime,attendanceStatus,warnings,rawScanMatched:!!scan,gpsStatus:'NOT_COLLECTED_HISTORICAL'}, {column:c,branch:/SKD.*17/i.test(position)?'SKD':branch,projectRef:'site:'+(/SKD.*17/i.test(position)?'SKD':branch),employeeRef:e?.key,effectiveDate:date,status:warnings.length?'REVIEW':attendanceStatus==='TIDAK_DIKETAHUI'?'UNKNOWN':'VALIDATED'});
   }
  }
 }
 const overPeriod=[];
 for(const [sheet,branch,nameCol,hadirCol,summaryStart,summaryEnd]of [['REKAP ABSENSI HALIM OKT 2026','HLM',3,120,116,121],['REKAP ABSENSI GOR OKTOBER 2026','GOR',3,121,116,123],['REKAP ABSENSI OKTOBER KLH 2026','KLH',2,109,104,111]]){
  const s=f.book.sheets.find(s=>s.name===sheet),rows=[...new Set(facts.filter(f=>f.kind==='ATTENDANCE'&&f.sheet===sheet).map(f=>f.row))];
  for(const n of rows){const daily=facts.filter(f=>f.kind==='ATTENDANCE'&&f.sheet===sheet&&f.row===n),declaredPresent=number(s.value(n,hadirCol)),counts=Object.fromEntries(Object.entries(Object.groupBy(daily,f=>f.data.attendanceStatus)).map(([k,a])=>[k,a.length]));const warnings=[];if(declaredPresent!==null&&declaredPresent>daily.length){warnings.push('HADIR_SUMBER_MELEBIHI_RENTANG_HARI');overPeriod.push({sheet,row:n});}if(counts.TIDAK_DIKETAHUI)warnings.push('HARI_KOSONG_TIDAK_DIASUMSIKAN_HADIR');
   fact('ATTENDANCE_SUMMARY',f,s,n,{name:text(s.value(n,nameCol)),periodDays:daily.length,computedCounts:counts,declaredPresent,sourceSummary:Object.fromEntries(Array.from({length:summaryEnd-summaryStart+1},(_,i)=>summaryStart+i).map(c=>[c,s.value(n,c)])),warnings,basis:'Ringkasan sumber dibandingkan rentang tanggal dan bukti harian; tidak mengasumsikan hadir dari sel kosong'}, {branch:daily[0]?.branch??branch,projectRef:'site:'+(daily[0]?.branch??branch),employeeRef:daily[0]?.employeeRef,status:'REVIEW'});
  }
 }
 if(overPeriod.length)issue('ATTENDANCE_SUMMARY_VARIANCE','Jumlah hadir pada ringkasan sumber melebihi jumlah hari yang tersedia pada rekap',{count:overPeriod.length,rows:overPeriod});
 for(const s of f.book.sheets)for(const r of s.rows)for(const c of r.cells.values())if(c.error)issue('SOURCE_FORMULA_ERROR','Sel sumber mengandung error; kolom rekening tidak diimpor sebagai identitas karyawan',{file:f.id,sheet:s.name,row:r.number,cell:c.address,error:c.error});
}
// Accounting masters and a transparent, unposted source register. Source estimates remain estimates.
{
 const f=books[5],sheet=name=>f.book.sheets.find(s=>s.name===name);
 for(const r of sheet('MD_PROYEK').rows){const s=sheet('MD_PROYEK'),n=r.number,code=text(s.value(n,1)),name=text(s.value(n,2));if(n>4&&/^PRJ-/.test(code))add('PROJECT','project:'+code,name,{cluster:'CLEANING',sourceVerification:'PENDING',invoiceGroup:text(s.value(n,3)),vatMode:text(s.value(n,6))},site(name),f,s.name,n);}
 for(const [sh,type]of [['MD_PELANGGAN','CUSTOMER'],['MD_VENDOR','VENDOR']]){const s=sheet(sh);for(const r of s.rows){const n=r.number,code=text(s.value(n,1)),name=text(s.value(n,2));if(n<=4||!code||!name||!/^[CV]-?\d+/i.test(code))continue;if(/anonim|disamarkan|individual|perorangan/i.test(name)){issue('ANONYMOUS_VENDOR','Identitas vendor agregat tidak dibuat sebagai orang atau badan usaha',{file:f.id,sheet:s.name,row:n});continue;}add('PARTNER','partner:'+code,name,{type,sourceVerification:'PENDING',taxId:text(s.value(n,type==='CUSTOMER'?11:10)),sourceTaxRuleReference:text(s.value(n,type==='CUSTOMER'?7:6))},'HO',f,s.name,n);}}
 for(const r of sheet('MD_INVENTORY').rows){const s=sheet('MD_INVENTORY'),n=r.number,code=text(s.value(n,1)),name=text(s.value(n,2));if(n<=4||!code||!name||!/^[A-Z]+-?\d/i.test(code))continue;add('PRODUCT','catalog:'+code,name,{type:/sewa|rental|jasa/i.test(name+' '+text(s.value(n,3)))?'SERVICE':'STOCK',uom:text(s.value(n,4))||'UNIT',sourceVerification:'PENDING',budgetOnly:true,referencePrice:number(s.value(n,9)),category:text(s.value(n,3))},'HO',f,s.name,n);}
 for(const r of sheet('MD_ASET').rows){const s=sheet('MD_ASET'),n=r.number,code=text(s.value(n,1)),name=text(s.value(n,2));if(n>4&&code&&name)add('ASSET_CLASS','assetclass:'+code,name,{assetAccount:text(s.value(n,3)),depreciationAccount:text(s.value(n,4)),expenseAccount:text(s.value(n,5)),usefulLife:number(s.value(n,6)),sourceVerification:'PENDING'},'HO',f,s.name,n);}
 const co=sheet('COA');for(const r of co.rows){const n=r.number,code=text(co.value(n,1)),name=text(co.value(n,2));if(/^\d{5}$/.test(code)&&name)accounts.push({code,name,category:text(co.value(n,3)),normal:text(co.value(n,4)),cells:[...r.cells.values()].map(c=>({column:c.col,value:text(c.value)}))});}
 const sourceRows=(s,r)=>Object.fromEntries([...r.cells.values()].filter(c=>c.col<=29&&c.value!==null&&c.value!=='').map(c=>[String(c.col),c.value instanceof Date?c.value.toISOString():c.value]));
 const vouchers=new Map();for(const r of sheet('JURNAL').rows){const s=sheet('JURNAL'),n=r.number,voucher=text(s.value(n,1)),date=isoDate(s.value(n,2)),code=text(s.value(n,5)),debit=number(s.value(n,8)),credit=number(s.value(n,9));if(!date||!/^\d{5}$/.test(code)||!voucher)continue;const entry={voucher,date,code,debit:debit??0,credit:credit??0,row:n,data:sourceRows(s,r)};if(!vouchers.has(voucher))vouchers.set(voucher,[]);vouchers.get(voucher).push(entry);}
 let balanced=0,unbalanced=0;for(const [voucher,rows]of vouchers){const debit=rows.reduce((v,r)=>v+Math.round(r.debit*100),0),credit=rows.reduce((v,r)=>v+Math.round(r.credit*100),0),ok=debit===credit&&new Set(rows.map(r=>r.date)).size===1;if(ok)balanced++;else{unbalanced++;issue('VOUCHER_IMBALANCE','Voucher tidak seimbang atau tanggal tidak konsisten',{document:voucher,debit:debit/100,credit:credit/100});}for(const r of rows)fact('FINANCIAL_JOURNAL',f,sheet('JURNAL'),r.row,{...r.data,name:text(sheet('JURNAL').value(r.row,6)),description:text(sheet('JURNAL').value(r.row,7)),accountCode:r.code,basis:'SUMBER_BELUM_DIPOSTING',voucherBalanced:ok,containsEstimate:/estimasi|penampung|9990/i.test(JSON.stringify(r.data))},{effectiveDate:r.date,documentNumber:voucher,debit:r.debit,credit:r.credit,accountCode:r.code,status:'REVIEW'});}
 for(const s of f.book.sheets){if(s.name==='JURNAL')continue;for(const r of s.rows){if(r.number<=4)continue;const data=sourceRows(s,r);if(Object.keys(data).length<2)continue;const kind=['CEK','TEMUAN'].includes(s.name)?'CONTROL':['INV','TRS','INV_KCG','TRS_KCG','SALDO_AWAL','ASET','INVENTARIS','MD_BANK'].includes(s.name)?'FINANCIAL_SOURCE':'REFERENCE';const dated=['INV','TRS'].includes(s.name),documentDate=dated?isoDate(s.value(r.number,3)):null;fact(kind,f,s,r.number,{cells:data,basis:'SUMBER_BELUM_DIPOSTING',...(documentDate?{'Tanggal acuan':'Tanggal dokumen pada sumber'}:{})},{...(documentDate?{effectiveDate:documentDate,documentNumber:text(s.value(r.number,2))}:{}),status:s.name==='CEK'?'SOURCE_ASSERTION':'REVIEW'});}}
 issue('FINANCIAL_NOT_POSTED','Jurnal sumber mencakup estimasi, akun penampung, dan saldo bank belum direkonsiliasi; persetujuan Finance diperlukan sebelum posting resmi',{balancedVouchers:balanced,unbalancedVouchers:unbalanced});
 writeFileSync('data/upload-audit/accounts-v3.json',JSON.stringify(accounts,null,2));
}
// Unmatched historical names remain distinct inactive identities pending HR reconciliation.
const historical=new Map();
for(const f of facts.filter(f=>f.kind==='ATTENDANCE'&&!f.employeeRef)){
 const key='historical:'+hash(norm(f.data.name)+'|'+f.branch).slice(0,14);
 const m=add('EMPLOYEE',key,f.data.name,{position:f.data.position,location:siteNames[f.branch],currentRoster:false,historicalOnly:true,identityReview:true,sourceVerification:'PENDING'},f.branch,books[0],f.sheet,f.row,false);
 f.employeeRef=m.key;f.status='REVIEW';historical.set(norm(f.data.name)+'|'+f.branch,m.key);
}
for(const f of facts.filter(f=>['ATTENDANCE_SCAN','ATTENDANCE_SUMMARY'].includes(f.kind)&&!f.employeeRef)){const key=historical.get(norm(f.data.name)+'|'+f.branch);if(key)f.employeeRef=key;}
issue('HISTORICAL_IDENTITY_REVIEW','Nama historis yang tidak cocok persis dengan roster November disimpan terpisah dan nonaktif sampai diperiksa HR',{count:historical.size});
issue('ASSET_PIVOT_STALE','Register detail HO berisi 182 baris, sedangkan pivot kategori menyatakan 177; konfirmasi register terbaru',{file:books[3].id,sheet:'Master Aset'});
for(const f of facts.filter(f=>f.kind==='STOCK_SNAPSHOT'&&f.data.warnings.length))issue('STOCK_REVIEW','Saldo atau tanda mutasi memerlukan pemeriksaan',{file:f.file,sheet:f.sheet,row:f.row,warnings:f.data.warnings});
const counts={masters:Object.fromEntries([...new Set(masters.map(m=>m.kind))].map(k=>[k,masters.filter(m=>m.kind===k).length])),facts:Object.fromEntries([...new Set(facts.map(m=>m.kind))].map(k=>[k,facts.filter(m=>m.kind===k).length])),issues:issues.length,files:files.length};
const result={normalizerVersion:7,accounts,batch,companyId:'KBA',asOfDate:'2026-11-18',files,branches,masters,facts,issues,counts};mkdirSync('data/upload-audit',{recursive:true});writeFileSync('data/upload-audit/import-v3.json',JSON.stringify(result));writeFileSync('data/upload-audit/summary-v3.json',JSON.stringify({batch,counts,issues},null,2));console.log(JSON.stringify({batch,counts}));
