import { z } from 'zod';
import type { Role } from '@prisma/client';
import { db } from '../db';
import { assignedRole, allowedBranches, authorizeCompany, passwordHash, AccessError, type Actor } from '../auth';
import { assignableRoles, roleRanks, roleNames } from '../roles';
import { atomic, object, str, json, type Tx } from './shared';

export function canManageRole(actorRole:Role,targetRole:Role,nextRole:Role,superuser=false){
 return superuser || (roleRanks[actorRole]>roleRanks[targetRole] && assignableRoles[actorRole].includes(nextRole));
}
export function descendantIds(grants:{userId:string;managerId:string|null}[],root:string){
 const found=new Set<string>();let pending=[root];while(pending.length){const id=pending.pop()!;for(const g of grants)if(g.managerId===id&&!found.has(g.userId)&&g.userId!==root){found.add(g.userId);pending.push(g.userId);}}return found;
}
async function context(actor:Actor,companyId:string){
 const role=assignedRole(actor,companyId);if(!assignableRoles[role].length&&!actor.superuser)throw new AccessError('Tidak memiliki hak pengelolaan pengguna.');
 const grants=await db.accessGrant.findMany({where:{companyId}});
 return {role,grants,descendants:descendantIds(grants,actor.id),branches:allowedBranches(actor,companyId)};
}
export async function userDirectory(actor:Actor,companyId:string){
 const c=await context(actor,companyId);
 const visible=c.grants.filter(g=>actor.superuser||(['ADMIN','DIRECTOR','HR'].includes(c.role)||c.descendants.has(g.userId)||g.userId===actor.id));
 const ids=visible.map(g=>g.userId);
 const users=await db.user.findMany({where:actor.superuser?{}:{id:{in:ids}},select:{id:true,name:true,email:true,username:true,active:true,mustChangePassword:true,isSuperuser:true,grants:{where:actor.superuser?{}:{companyId},select:{companyId:true,role:true,branchIds:true,managerId:true,employeeId:true,active:true}}},orderBy:{name:'asc'}});
 return {users,roles:assignableRoles[c.role],role:c.role};
}
const grantSchema=z.object({userId:z.string().optional(),name:z.string().trim().min(2).max(150).optional(),email:z.union([z.email(),z.literal('')]).optional(),username:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/).optional(),password:z.string().min(16).max(256).optional(),role:z.enum(roleNames as [Role,...Role[]]),branchIds:z.array(z.string()).max(100).default([]),managerId:z.string().nullable().optional(),employeeId:z.string().nullable().optional()});
export async function manageUsers(actor:Actor,input:unknown){
 const s=object(input),companyId=str(s.companyId),action=str(s.action),d=object(s.data),c=await context(actor,companyId);
 return atomic(companyId,async tx=>{
  let target=d.userId?await tx.user.findUniqueOrThrow({where:{id:str(d.userId)},include:{grants:true}}):null;
  const old=target?.grants.find(g=>g.companyId===companyId);
  if(target){
   if(target.id===actor.id||target.isSuperuser)throw new AccessError('Akun sendiri dan pemilik tidak dapat dikelola melalui formulir ini.');
   if(!actor.superuser&&(!old||!canManageRole(c.role,old.role,old.role)))throw new AccessError('Pengguna setara, lebih tinggi, atau di luar perusahaan.');
   if(!actor.superuser&&c.role==='MANAGER'&&!c.descendants.has(target.id))throw new AccessError('Pengguna di luar hierarki Anda.');
   if(!actor.superuser&&c.branches.length&&(!old?.branchIds.length||old.branchIds.some(id=>!c.branches.includes(id))))throw new AccessError('Pengguna di luar cabang Anda.');
  }
  let result:unknown;
  if(action==='user'||action==='grant'){
   const p=grantSchema.parse(d);
   if(!actor.superuser&&!assignableRoles[c.role].includes(p.role))throw new AccessError('Peran tidak dapat diberikan.');
   if(c.branches.length&&(!p.branchIds.length||p.branchIds.some(id=>!c.branches.includes(id))))throw new AccessError('Cakupan cabang tidak boleh diperluas.');
   for(const id of p.branchIds)await tx.branch.findFirstOrThrow({where:{id,companyId}});
   const managerId=p.managerId??null,employeeId=p.employeeId??null;
   if(!actor.superuser&&c.role==='MANAGER'&&managerId!==actor.id&&!c.descendants.has(managerId??''))throw new AccessError('Atasan harus berada dalam hierarki Anda.');
   if(managerId){
    const parent=await tx.user.findUniqueOrThrow({where:{id:managerId},include:{grants:true}}),pg=parent.grants.find(g=>g.companyId===companyId&&g.active);
    if(!parent.active||(!parent.isSuperuser&&(!pg||roleRanks[pg.role]<=roleRanks[p.role])))throw new Error('Atasan wajib aktif dan memiliki tingkat lebih tinggi.');
    if(pg?.branchIds.length&&(!p.branchIds.length||p.branchIds.some(id=>!pg.branchIds.includes(id))))throw new Error('Cabang bawahan harus berada dalam cakupan atasan.');
    if(target&&(managerId===target.id||descendantIds(c.grants,target.id).has(managerId)))throw new Error('Siklus hierarki tidak diperbolehkan.');
   }
   if(target){for(const child of c.grants.filter(g=>g.managerId===target!.id&&g.active))if(roleRanks[child.role]>=roleRanks[p.role]||(p.branchIds.length&&(!child.branchIds.length||child.branchIds.some(id=>!p.branchIds.includes(id)))))throw new Error('Pindahkan bawahan sebelum menurunkan peran atau mempersempit cabang.');}
   const emp=employeeId?await tx.masterRecord.findFirstOrThrow({where:{id:employeeId,companyId,kind:'EMPLOYEE',active:true}}):null;
   if(emp&&p.branchIds.length&&(!emp.branchId||!p.branchIds.includes(emp.branchId)))throw new Error('Karyawan di luar cakupan cabang.');
   if(emp&&object(emp.data).userId&&object(emp.data).userId!==target?.id)throw new Error('Karyawan telah terhubung ke pengguna lain.');
   if(action==='user'){
    if(target||!p.name||!p.password||(!p.email&&!p.username))throw new Error('Nama, identitas login dan kata sandi awal wajib diisi.');
    target=await tx.user.create({data:{name:p.name,email:p.email?.toLowerCase()||null,username:p.username||null,passwordHash:await passwordHash(p.password),mustChangePassword:true},include:{grants:true}});
   }
   if(!target)throw new Error('Pengguna belum dipilih.');
   if(old?.employeeId&&old.employeeId!==employeeId){const prev=await tx.masterRecord.findUnique({where:{id:old.employeeId}});if(prev&&object(prev.data).userId===target.id){const data=object(prev.data);delete data.userId;await tx.masterRecord.update({where:{id:prev.id},data:{data:json(data)}});}}
   result=await tx.accessGrant.upsert({where:{userId_companyId:{userId:target.id,companyId}},create:{userId:target.id,companyId,role:p.role,branchIds:p.branchIds,managerId,employeeId},update:{role:p.role,branchIds:p.branchIds,managerId,employeeId}});
   if(emp)await tx.masterRecord.update({where:{id:emp.id},data:{data:json({...object(emp.data),userId:target.id})}});
  }else if(action==='companyAccess'){
   if(!target||!old)throw new Error('Pengguna belum dipilih.');
   const active=d.active===true;
   if(!active&&c.grants.some(g=>g.managerId===target!.id&&g.active))throw new Error('Pindahkan semua bawahan aktif sebelum menonaktifkan atasan.');
   result=await tx.accessGrant.update({where:{id:old.id},data:{active}});
  }else if(action==='resetPassword'||action==='userProfile'){
   if(!target)throw new Error('Pengguna belum dipilih.');
   if(!actor.superuser&&target.grants.some(g=>g.companyId!==companyId))throw new AccessError('Profil dan kata sandi pengguna lintas perusahaan dikelola administrator pusat.');
   if(action==='resetPassword')result=await tx.user.update({where:{id:target.id},data:{passwordHash:await passwordHash(str(d.password)),mustChangePassword:true}});
   else {const p=z.object({name:z.string().trim().min(2).max(150),email:z.union([z.email(),z.literal('')]),username:z.union([z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),z.literal('')])}).parse(d);if(!p.email&&!p.username)throw new Error('Minimal satu identitas login diperlukan.');result=await tx.user.update({where:{id:target.id},data:{name:p.name,email:p.email.toLowerCase()||null,username:p.username||null}});}
  }else throw new Error('Aksi pengguna tidak dikenal.');
  if(target)await tx.userSession.deleteMany({where:{userId:target.id}});
  await tx.auditEvent.create({data:{companyId,actorId:actor.id,action:`USER_${action.toUpperCase()}`,entityId:target?.id??'',details:json({role:d.role,active:d.active,managerId:d.managerId,employeeId:d.employeeId,branchIds:d.branchIds})}});
  return {ok:true};
 });
}
