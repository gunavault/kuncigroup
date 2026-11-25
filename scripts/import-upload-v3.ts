import 'dotenv/config';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {matchEmployeeIdentity,identityName} from '../src/lib/source-identity';
import {classifySourceAccount} from '../src/lib/source-account';
import {companyCatalogKinds} from '../src/lib/operations/master-scope';
import {Prisma,PrismaClient} from '@prisma/client';
const db=new PrismaClient(),bundle=JSON.parse(readFileSync(process.argv[2]??'data/upload-audit/import-v3.json','utf8'));
const id=(s:string)=>'v3-'+createHash('sha256').update(s).digest('hex').slice(0,28);
const norm=(s:unknown)=>String(s??'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
const obj=(s:unknown)=>s&&typeof s==='object'?s as Record<string,any>:{};
const companyId=bundle.companyId,refs=new Map<string,string>(),branchRefs=new Map<string,string>();
const result={batch:bundle.batch,created:0,updated:0,facts:0,accountLinked:0,unmatchedEmployees:0,identityReviewRows:bundle.facts.filter((f:any)=>f.kind==='ATTENDANCE'&&f.data.warnings?.includes('KARYAWAN_BELUM_DIPADANKAN')).length};
try{
await db.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM companies WHERE id=${companyId} FOR UPDATE`;
 const previousBatch=await tx.dataImportBatch.findUnique({where:{id:bundle.batch}});
 if(previousBatch&&obj(previousBatch.stats).normalizerVersion!==bundle.normalizerVersion){
  const reviewed=await tx.sourceFact.findMany({where:{batchId:bundle.batch,status:{in:['REVIEWED','REJECTED']}},select:{id:true}});
  await tx.sourceFact.deleteMany({where:{batchId:bundle.batch,id:{notIn:reviewed.map(r=>r.id)}}});
 }
 await tx.dataImportBatch.upsert({where:{id:bundle.batch},create:{id:bundle.batch,companyId,name:'Unggahan master data November 2026',asOfDate:new Date(bundle.asOfDate),stats:bundle.counts,issues:bundle.issues},update:{stats:bundle.counts,issues:bundle.issues,status:'PREPARED'}});
 for(const f of bundle.files)await tx.sourceFile.upsert({where:{id:f.id},create:{id:f.id,companyId,name:f.name,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',path:'Unggahan pengguna / '+f.name,url:'',sha256:f.sha256,status:'IMPORTED',rowCount:f.rowCount,notes:JSON.stringify({headers:f.headers,originalPreserved:true})},update:{status:'IMPORTED',rowCount:f.rowCount,notes:JSON.stringify({headers:f.headers,originalPreserved:true})}});
 const oldBranches=await tx.branch.findMany({where:{companyId}});
 const branchAliases:Record<string,string[]>={HO:['HEADOFFICE','KANTORPUSAT'],HLM:['HALIMPANDAWA'],GOR:['GORCHANDRABAGA','GORCANDRABHAGA','GORCHANDRABHAGA'],KLH:['KLH'],BONAS:['KLHBONAS','KLHKEBONNANAS'],PLAZA:['KLHPLAZAKUNINGAN','KLHKUNINGAN'],SKD:['SKD17','HALIMSKD17']};
 for(const b of bundle.branches){
  const own=oldBranches.find(v=>v.code==='UP-'+b.code),candidates=oldBranches.filter(v=>(branchAliases[b.code]??[]).includes(norm(v.name)));
  let old=own??(candidates.length===1?candidates[0]:null);
  if(!old)old=await tx.branch.upsert({where:{companyId_code:{companyId,code:'UP-'+b.code}},create:{companyId,code:'UP-'+b.code,name:b.name},update:{}});
  branchRefs.set(b.code,old.id);
 }

 let all=await tx.masterRecord.findMany({where:{companyId}});
 for(const m of bundle.masters){
  const data=obj(m.data),code=String(m.code).replace(/[^A-Za-z0-9._/-]/g,'-').slice(0,60);
  const nameIsUnique=bundle.masters.filter((r:any)=>r.kind==='EMPLOYEE'&&r.data.currentRoster&&identityName(r.name)===identityName(m.name)).length===1;
  let old=m.kind==='EMPLOYEE'&&data.workId?matchEmployeeIdentity(all,String(data.workId),m.name,nameIsUnique) as typeof all[number]|undefined:all.find(v=>v.sourceKey==='upload-master:'+m.key||Array.isArray(obj(v.data).importKeys)&&obj(v.data).importKeys.includes(m.key)||v.kind===m.kind&&v.code===code);
  if(!old&&['PRODUCT','PARTNER'].includes(m.kind)){const same=all.filter(v=>v.kind===m.kind&&norm(v.name)===norm(m.name)&&(m.kind!=='PRODUCT'||norm(obj(v.data).uom)===norm(data.uom)));if(same.length===1)old=same[0];}
  const prior=obj(old?.data),references=Array.isArray(prior.sourceReferences)?prior.sourceReferences:[];
  const next:Record<string,any>={...(prior.importBatch===bundle.batch&&prior.normalizerVersion===bundle.normalizerVersion?{...data,...prior}:{...prior,...data}),normalizerVersion:bundle.normalizerVersion,importKeys:[...new Set([...(Array.isArray(prior.importKeys)?prior.importKeys:[]),m.key])],sourceReferences:[...references.filter((v:any)=>v.file!==m.file),{file:m.file,sheet:m.sheet,row:m.row}],importBatch:bundle.batch};
  // An approved master keeps its reviewed operational settings and user linkage.
  if(prior.sourceVerification==='VERIFIED'&&m.kind!=='EMPLOYEE'){for(const k of ['sourceVerification','type','uom','trackExpiry','cost','salePrice'])if(prior[k]!==undefined)next[k]=prior[k];}
  if(prior.userId)next.userId=prior.userId;
  const sharedCatalog=companyCatalogKinds.includes(m.kind)&&prior.sourceVerification!=='VERIFIED';
  const masterBranchId=sharedCatalog?null:prior.sourceVerification==='VERIFIED'&&old?old.branchId:branchRefs.get(m.branch)??null;
  if(sharedCatalog){next.scope='COMPANY';next.sourceLocation=next.sourceLocation??m.branch;}
  const saved=old?await tx.masterRecord.update({where:{id:old.id},data:{name:prior.importBatch===bundle.batch&&prior.normalizerVersion===bundle.normalizerVersion?old.name:m.name,branchId:masterBranchId,active:prior.importBatch===bundle.batch&&prior.normalizerVersion===bundle.normalizerVersion?old.active:m.active,data:next}}):await tx.masterRecord.create({data:{id:id('master:'+companyId+':'+m.key),companyId,branchId:masterBranchId,kind:m.kind,code,name:m.name,active:m.active,data:next,sourceKey:'upload-master:'+m.key,sourceFileId:m.file,sourceRow:m.sheet+'!'+m.row}});
  refs.set(m.key,saved.id);if(old){result.updated++;all=all.map(v=>v.id===saved.id?saved:v);}else{result.created++;all.push(saved);}
  if(m.kind==='EMPLOYEE'&&!m.active){await tx.accessGrant.updateMany({where:{companyId,employeeId:saved.id},data:{active:false}});if(prior.userId){await tx.accessGrant.updateMany({where:{companyId,userId:prior.userId},data:{active:false}});await tx.userSession.deleteMany({where:{userId:prior.userId}});}}
 }
 for(const m of bundle.masters){const current=await tx.masterRecord.findUniqueOrThrow({where:{id:refs.get(m.key)!}}),data=obj(current.data);let changed=false;for(const [key,v]of Object.entries(data))if(key.endsWith('Ref')&&typeof v==='string'&&refs.has(v)){data[key.slice(0,-3)+'Id']=refs.get(v);changed=true;}if(changed)await tx.masterRecord.update({where:{id:current.id},data:{data}});}
 for(const a of bundle.accounts??[]){
  const classification=classifySourceAccount(a.category,a.normal);
  if(classification)await tx.account.upsert({where:{code:a.code},create:{code:a.code,name:a.name,...classification,isCash:a.cells.some((c:any)=>c.column===6&&c.value==='Y')&&classification.category==='ASET'&&!classification.isContra},update:{}});

 }
 const accounts=await tx.account.findMany(),accountByCode=new Map(accounts.map(a=>[a.code,a.id]));
 for(let start=0;start<bundle.facts.length;start+=500){const rows=bundle.facts.slice(start,start+500).map((f:any)=>{if(f.kind==='ATTENDANCE'&&!f.employeeRef)result.unmatchedEmployees++;if(f.accountCode&&accountByCode.has(f.accountCode))result.accountLinked++;return {id:id('fact:'+f.key),sourceKey:f.key,companyId,batchId:bundle.batch,kind:f.kind,sourceFileId:f.file,sheet:f.sheet,row:f.row,column:f.column??null,branchId:branchRefs.get(f.branch)??null,effectiveDate:f.effectiveDate?new Date(f.effectiveDate):null,employeeId:refs.get(f.employeeRef)??null,projectId:refs.get(f.projectRef)??null,productId:refs.get(f.productRef)??null,assetId:refs.get(f.assetRef)??null,accountId:accountByCode.get(f.accountCode)??null,documentNumber:f.documentNumber??null,quantity:f.quantity??null,debit:f.debit??null,credit:f.credit??null,amount:f.amount??null,status:f.status??'VALIDATED',data:f.data};});
  // Source-byte keys are immutable. A rerun only inserts missing rows.
  await tx.sourceFact.createMany({data:rows,skipDuplicates:true});result.facts+=rows.length;
 }
 const documentDates=bundle.facts.filter((f:any)=>f.kind==='FINANCIAL_SOURCE'&&f.effectiveDate).map((f:any)=>({key:f.key,date:f.effectiveDate,number:f.documentNumber??null}));
 if(documentDates.length)await tx.$executeRaw(Prisma.sql`UPDATE source_facts AS t SET "effectiveDate"=s.date,"documentNumber"=s.number,"updatedAt"=CURRENT_TIMESTAMP FROM jsonb_to_recordset(${JSON.stringify(documentDates)}::jsonb) AS s(key text,date date,number text) WHERE t."sourceKey"=s.key AND t."companyId"=${companyId}`);
 for(const [code,accountId]of accountByCode)await tx.sourceFact.updateMany({where:{batchId:bundle.batch,kind:'FINANCIAL_JOURNAL',accountId:null,data:{path:['accountCode'],equals:code}},data:{accountId}});
 await tx.dataImportBatch.update({where:{id:bundle.batch},data:{status:'IMPORTED_WITH_REVIEW',completedAt:new Date(),stats:{...bundle.counts,...result,normalizerVersion:bundle.normalizerVersion}}});
 await tx.auditEvent.create({data:{companyId,actorId:'source-import',action:'UPLOAD_BATCH_IMPORTED',entityId:bundle.batch,details:result}});
},{timeout:300000,maxWait:30000,isolationLevel:'Serializable'});
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/import-v3-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
