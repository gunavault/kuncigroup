import 'dotenv/config';import {PrismaClient} from '@prisma/client';import {readFileSync} from 'node:fs';import {identityName} from '../src/lib/source-identity';
const db=new PrismaClient(),bundle=JSON.parse(readFileSync('data/upload-audit/import-v3.json','utf8')),baseline=JSON.parse(readFileSync('data/identity-pre-import.json','utf8'));
const input=bundle.masters.filter((m:any)=>m.kind==='EMPLOYEE'&&m.data.currentRoster),groups=Object.groupBy(input,(m:any)=>identityName(m.name)),ambiguous=new Set(Object.values(groups).filter((a:any)=>a.length>1).flatMap((a:any)=>a.map((m:any)=>m.data.workId)));
let restored=0,canonicalized=0;
try{await db.$transaction(async tx=>{
 const current=await tx.masterRecord.findMany({where:{companyId:'KBA',kind:'EMPLOYEE'}});
 for(const r of current){const data=r.data as any;if(data.importBatch!==bundle.batch||!data.currentRoster)continue;
  const previous=baseline.find((v:any)=>v.id===r.id);
  if(previous&&ambiguous.has(data.workId)){
   const changed=await tx.auditEvent.count({where:{entityId:r.id,action:'MASTER_SAVED',createdAt:{gt:new Date('2026-11-18T08:20:00Z')}}});if(changed)throw new Error('Master telah diedit manual setelah deployment; pemulihan harus ditinjau.');
   await tx.masterRecord.update({where:{id:r.id},data:{name:previous.name,branchId:previous.branchId,active:previous.active,data:previous.data}});restored++;
  }else if(r.sourceKey?.startsWith('upload-master:employee:')){
   const workId=r.sourceKey.slice('upload-master:employee:'.length);if(data.workId!==workId||(data.importKeys??[]).filter((k:string)=>k.startsWith('employee:')).length>1){await tx.masterRecord.update({where:{id:r.id},data:{data:{...data,workId,importKeys:['employee:'+workId]}}});canonicalized++;}
  }
 }
 await tx.auditEvent.create({data:{companyId:'KBA',actorId:'source-import',action:'EMPLOYEE_IDENTITY_REPAIR',entityId:bundle.batch,details:{restored,canonicalized,reason:'Preserve distinct work IDs for equal employee names; restore legacy identities from pre-import backup'}}});
},{timeout:30000});console.log(JSON.stringify({restored,canonicalized}));}finally{await db.$disconnect();}
