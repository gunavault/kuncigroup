import {Prisma} from '@prisma/client';
import {db} from '../db';
import {authorizeCompany,allowedBranches,type Actor,AccessError} from '../auth';
import {atomic,json,object,str} from './shared';
import {saveRecord} from './engine';
export function sourceScope(actor:Actor,companyId:string,branch?:string){
 const role=authorizeCompany(actor,companyId,undefined,branch||undefined),branches=allowedBranches(actor,companyId);
 const where:Prisma.SourceFactWhereInput={companyId,...(branch?{branchId:branch}:branches.length?{branchId:{in:branches}}:{})};
 if(role==='STAFF'){if(!branch)delete where.branchId;const employeeId=actor.grants.find(g=>g.companyId===companyId)?.employeeId;where.kind={in:['ATTENDANCE','ATTENDANCE_SUMMARY']};where.employeeId=employeeId??'NO_LINKED_EMPLOYEE';}
 else if(role==='HR'){where.OR=[{kind:{in:['ATTENDANCE','ATTENDANCE_SCAN','ATTENDANCE_SUMMARY']}},{kind:'REFERENCE',sheet:{in:['MD_KARYAWAN','MD_JABATAN','MD_PAYROLL','UJI_PAYROLL']}}];}
 else if(role==='SUPERVISOR')where.kind={in:['ATTENDANCE','ATTENDANCE_SCAN','ATTENDANCE_SUMMARY','STOCK_SNAPSHOT']};
 return {where,role};
}
export async function sourceData(actor:Actor,companyId:string,p:URLSearchParams){
 const {where,role}=sourceScope(actor,companyId,p.get('branch')??'');
 const filters:Prisma.SourceFactWhereInput[]=[where];
 if(p.get('kind'))filters.push({kind:p.get('kind')!});if(p.get('status'))filters.push({status:p.get('status')!});if(p.get('sheet'))filters.push({sheet:p.get('sheet')!});
 const from=p.get('from'),to=p.get('to');for(const date of [from,to])if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Tanggal tidak valid.');if(from||to)filters.push({effectiveDate:{...(from?{gte:new Date(from)}:{}),...(to?{lte:new Date(to)}:{})}});
 const q=p.get('q')?.slice(0,150);if(q)filters.push({OR:[{documentNumber:{contains:q,mode:'insensitive'}},{sheet:{contains:q,mode:'insensitive'}},...[['accountCode'],['cells','2'],['cells','3'],['cells','4'],['cells','5'],['cells','6']].map(path=>({data:{path,string_contains:q,mode:'insensitive' as const}})),{data:{path:['name'],string_contains:q,mode:'insensitive'}},{data:{path:['description'],string_contains:q,mode:'insensitive'}}]});
 const page=Math.min(100000,Math.max(0,Math.floor(Number(p.get('page'))||0))),filtered={AND:filters};
 const [rows,total,stats,batches]=await Promise.all([db.sourceFact.findMany({where:filtered,orderBy:[{effectiveDate:'desc'},{sheet:'asc'},{row:'asc'},{column:'asc'}],take:50,skip:page*50}),db.sourceFact.count({where:filtered}),db.sourceFact.groupBy({by:['kind','status'],where,_count:true}),['ADMIN','MANAGER','FINANCE','AUDITOR'].includes(role)&&!allowedBranches(actor,companyId).length?db.dataImportBatch.findMany({where:{companyId},orderBy:{createdAt:'desc'},take:10}):Promise.resolve([])]);
 const ids=[...new Set(rows.flatMap(r=>[r.employeeId,r.projectId,r.productId,r.assetId]).filter((s):s is string=>!!s))];
 const [masters,files]=await Promise.all([db.masterRecord.findMany({where:{id:{in:ids},companyId},select:{id:true,name:true,code:true}}),db.sourceFile.findMany({where:{id:{in:[...new Set(rows.map(r=>r.sourceFileId))]}},select:{id:true,name:true,notes:true}})]);
 return {rows,total,page,stats,batches,masters,files:files.map(f=>{let headers={};try{headers=JSON.parse(f.notes).headers??{};}catch{}return {id:f.id,name:f.name,headers};}),pageSize:50,reviewAllowed:['ADMIN','MANAGER','FINANCE','HR'].includes(role)};
}
export async function reviewSource(actor:Actor,input:unknown){
 const d=object(input),companyId=str(d.companyId),{where,role}=sourceScope(actor,companyId);
 if(!['ADMIN','MANAGER','FINANCE','HR'].includes(role))throw new AccessError('Hak peninjauan diperlukan.');
 const note=str(d.note).trim();if(note.length<10||note.length>2000)throw new Error('Catatan pemeriksaan wajib 10–2000 karakter.');
 return atomic(companyId,async tx=>{
  const row=await tx.sourceFact.findFirstOrThrow({where:{AND:[where,{id:str(d.id)}]}});
  if(row.branchId)authorizeCompany(actor,companyId,undefined,row.branchId);
  let employeeId=row.employeeId;
  if(d.employeeId){if(!['ATTENDANCE','ATTENDANCE_SCAN','ATTENDANCE_SUMMARY'].includes(row.kind))throw new Error('Pemetaan karyawan khusus data absensi.');const e=await tx.masterRecord.findFirstOrThrow({where:{id:str(d.employeeId),companyId,kind:'EMPLOYEE'}});authorizeCompany(actor,companyId,undefined,e.branchId);employeeId=e.id;}
  const status=d.decision==='REJECT'?'REJECTED':'REVIEWED';
  await tx.sourceFact.update({where:{id:row.id},data:{employeeId,status,data:json({...object(row.data),review:{note,actorId:actor.id,reviewer:actor.name,reviewedAt:new Date().toISOString(),decision:status}})}});
  await tx.auditEvent.create({data:{companyId,actorId:actor.id,action:'SOURCE_REVIEWED',entityId:row.id,details:{status,note,employeeId}}});return {ok:true};
 });
}
export async function prepareStockOpening(actor:Actor,input:unknown){
 const d=object(input),companyId=str(d.companyId);
 authorizeCompany(actor,companyId,['ADMIN','FINANCE']);
 const source=await db.sourceFact.findFirstOrThrow({where:{id:str(d.id),companyId,kind:'STOCK_SNAPSHOT',status:'REVIEWED'}});
 authorizeCompany(actor,companyId,['ADMIN','FINANCE'],source.branchId);
 if(!source.quantity||source.quantity.lte(0)||!source.productId||!source.branchId)throw new Error('Saldo positif, produk, dan cabang diperlukan.');
 if(str(d.proof).trim().length<10)throw new Error('Bukti saldo dan dasar biaya unit wajib dijelaskan.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(str(d.date))||source.effectiveDate&&new Date(str(d.date))<source.effectiveDate)throw new Error('Tanggal pembukaan tidak boleh mendahului mutasi sumber.');
 if(!/^\d{1,13}(\.\d{1,2})?$/.test(str(d.unitCost))||Number(d.unitCost)<=0)throw new Error('Biaya per unit wajib positif dengan maksimal dua desimal.');
 const product=await db.masterRecord.findUniqueOrThrow({where:{id:source.productId}}),sd=object(source.data);
 const warehouses=await db.masterRecord.findMany({where:{companyId,branchId:source.branchId,kind:'WAREHOUSE'}});
 const warehouse=warehouses.find(w=>{const keys=object(w.data).importKeys;return w.sourceKey==='upload-master:'+str(sd.warehouseRef)||Array.isArray(keys)&&keys.includes(str(sd.warehouseRef));})??(warehouses.length===1?warehouses[0]:null);
 if(!warehouse)throw new Error('Gudang sumber belum dipadankan secara unik.');
 const existing=await db.businessRecord.findFirst({where:{companyId,status:{notIn:['CANCELLED','REJECTED']},data:{path:['sourceStockFactId'],equals:source.id}}});
 if(existing)throw new Error(`Draft pembukaan sudah tersedia: ${existing.number}`);
 return saveRecord(actor,{companyId,branchId:source.branchId,module:'inventory',title:'Pembukaan saldo sumber: '+product.name,date:str(d.date),data:{operation:'RECEIVE',warehouseId:warehouse.id,reason:str(d.proof),sourceStockFactId:source.id,sourceBasis:'Pembukaan dari saldo sumber yang telah ditinjau; menunggu persetujuan dan posting Finance'},lines:[{productId:product.id,description:product.name,quantity:source.quantity.toFixed(3),unitPrice:str(d.unitCost),data:{lotCode:str(d.lotCode)||'OPEN-'+source.id.slice(-12),expiresAt:str(d.expiresAt)}}]});
}
