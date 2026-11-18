export type EmployeeIdentity={id:string;kind:string;name:string;code:string;sourceKey:string|null;data:unknown};
const object=(v:unknown)=>v&&typeof v==='object'?v as Record<string,unknown>:{};
export const identityName=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function matchEmployeeIdentity(records:EmployeeIdentity[],workId:string,name:string,nameIsUnique:boolean){
 const employees=records.filter(r=>r.kind==='EMPLOYEE'),sameId=employees.filter(r=>String(object(r.data).workId??'')===workId);
 if(sameId.length>1)throw new Error('ID kerja terhubung ke lebih dari satu master; perbaiki identitas sebelum impor.');
 if(sameId.length===1)return sameId[0];
 const canonical=employees.find(r=>r.sourceKey==='upload-master:employee:'+workId&&!object(r.data).workId);
 if(canonical)return canonical;
 if(!nameIsUnique)return undefined;
 const candidates=employees.filter(r=>identityName(r.name)===identityName(name)&&!object(r.data).workId&&!(Array.isArray(object(r.data).importKeys)&&(object(r.data).importKeys as string[]).some(k=>k.startsWith('employee:'))));
 return candidates.length===1?candidates[0]:undefined;
}
