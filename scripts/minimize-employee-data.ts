import 'dotenv/config';import {readFileSync,writeFileSync} from 'node:fs';import {db} from '../src/lib/db';
const input=JSON.parse(readFileSync('data/drive-normalized.json','utf8'));
let sourceFieldsRemoved=0;
for(const row of [...input.masters,...input.rows])if(row.kind==='EMPLOYEE'&&/^[0-9]{16}$/.test(String(row.data?.internalCode??'').replaceAll(' ',''))){delete row.data.internalCode;sourceFieldsRemoved++;}
writeFileSync('data/drive-normalized.json',JSON.stringify(input,null,2));
const masters=await db.$executeRaw`UPDATE master_records SET data=data-'internalCode' WHERE kind='EMPLOYEE' AND regexp_replace(data->>'internalCode','[[:space:]]','','g') ~ '^[0-9]{16}$'`;
const rows=await db.$executeRaw`UPDATE import_rows SET data=data-'internalCode' WHERE kind='EMPLOYEE' AND regexp_replace(data->>'internalCode','[[:space:]]','','g') ~ '^[0-9]{16}$'`;
const remaining=await db.$queryRaw<{count:bigint}[]>`SELECT count(*) AS count FROM master_records WHERE kind='EMPLOYEE' AND regexp_replace(data->>'internalCode','[[:space:]]','','g') ~ '^[0-9]{16}$'`;
if(Number(remaining[0].count))throw new Error('Data minimization verification failed');
if(masters||rows)await db.auditEvent.create({data:{companyId:'KBA',actorId:'data-minimization',action:'EMPLOYEE_DATA_MINIMIZED',entityId:'drive-import',details:{masters,rows,sourceFieldsRemoved,remaining:0}}});
console.log(JSON.stringify({sourceFieldsRemoved,masters,rows,remaining:0}));await db.$disconnect();
