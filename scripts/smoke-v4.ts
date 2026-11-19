import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:3000';
const password = process.env.APP_PASSWORD || readFileSync('data/kunci-cloud-access.txt','utf8').match(/^Password aplikasi: (.+)$/m)?.[1].trim();
assert.ok(password);
assert.equal((await fetch(base+'/api/operations?company=KBA&view=module-kpis&module=sales')).status,401);
const login=await fetch(base+'/api/session',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@kuncigroup.cloud',password})});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie()[0];assert.ok(cookie.includes('Secure')&&cookie.includes('HttpOnly')&&cookie.includes('SameSite=strict'));
const headers={cookie:cookie.split(';')[0]};
const get=async(params:Record<string,string>)=>{const r=await fetch(base+'/api/operations?'+new URLSearchParams({company:'KBA',...params}),{headers});assert.equal(r.status,200);assert.match(r.headers.get('cache-control')??'',/no-store/);return r.json();};
const state=await get({});assert.equal(state.modules.length,19);
for(const m of state.modules){const r=await get({view:'module-kpis',module:m.key});assert.ok(r.cards.length>=4&&r.cards.length<=6,m.key);assert.ok(r.cards.every((c:{value:string|null})=>c.value===null||/^-?\d+(\.\d{2})?$/.test(c.value)),m.key);}
const sales=await get({view:'module-kpis',module:'sales'}), register=await get({module:'sales'});assert.equal(Number(sales.cards.find((c:{key:string})=>c.key==='total').value),register.total);
const empty=await get({view:'module-kpis',module:'sales',q:'__QA_NO_SUCH_DOCUMENT__'});assert.equal(empty.cards.find((c:{key:string})=>c.key==='total').value,'0');
const branch=state.branches[0];assert.ok(branch);const scoped=await get({branch:branch.id});assert.ok(scoped.masters.every((m:{branchId:string|null;kind:string})=>m.branchId===branch.id||m.branchId===null&&['PRODUCT','PARTNER','BOM','DEPARTMENT','POSITION','ASSET_CLASS'].includes(m.kind)));
const logout=await fetch(base+'/api/session',{method:'DELETE',headers:{...headers,origin:base}});assert.equal(logout.status,200);assert.equal((await fetch(base+'/api/operations?company=KBA&view=module-kpis&module=sales',{headers})).status,401);
const report={testedAt:new Date().toISOString(),base,status:'PASS',modules:19,cardCount:'4–6',fullRegisterCounts:true,search:true,branchScope:true,noStore:true,guestDenied:true,logoutRevoked:true};mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/production-smoke-v4.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
