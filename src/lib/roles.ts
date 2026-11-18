import type {Role} from '@prisma/client';
export const roleLabels:Record<Role,string>={ADMIN:'Administrator',DIRECTOR:'Direktur',MANAGER:'Manager',FINANCE:'Finance',HR:'HR',SUPERVISOR:'Supervisor',STAFF:'Staf',EMPLOYEE:'Karyawan',AUDITOR:'Auditor'};
export const roleRanks:Record<Role,number>={ADMIN:100,DIRECTOR:80,MANAGER:60,FINANCE:50,HR:50,SUPERVISOR:40,STAFF:30,EMPLOYEE:20,AUDITOR:10};
export const roleNames=Object.keys(roleLabels) as Role[];
export const effectiveRole=(role:Role):Role=>role==='DIRECTOR'?'MANAGER':role==='EMPLOYEE'?'STAFF':role;
export const assignableRoles:Record<Role,Role[]>={ADMIN:roleNames,DIRECTOR:['MANAGER','FINANCE','HR','SUPERVISOR','STAFF','EMPLOYEE','AUDITOR'],MANAGER:['SUPERVISOR','STAFF','EMPLOYEE'],HR:['STAFF','EMPLOYEE'],FINANCE:[],SUPERVISOR:[],STAFF:[],EMPLOYEE:[],AUDITOR:[]};
export const employeeModules=new Set(['cash-advance','expenses','attendances','timesheets']);
