import 'dotenv/config';
import { existsSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import path from 'node:path';
// Check before importing embedded-postgres: its exit hooks intercept process.exit.
const portBusy=await new Promise<boolean>((resolve)=>{const s=createConnection({host:'127.0.0.1',port:55432});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
if(portBusy){console.log('PostgreSQL lokal sudah aktif di 127.0.0.1:55432. Tidak perlu dijalankan ulang.');process.exit(0);}
const {default:EmbeddedPostgres}=await import('embedded-postgres');
const dir=path.resolve('data/postgres');mkdirSync('data',{recursive:true});
const credentialPath=path.resolve('data/local-password');
const password=existsSync(credentialPath)?readFileSync(credentialPath,'utf8'):randomBytes(24).toString('hex');
if(!existsSync(credentialPath))writeFileSync(credentialPath,password,{mode:0o600});
const pg=new EmbeddedPostgres({databaseDir:dir,user:'kunci',password,port:55432,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:(e)=>console.error(String(e))});
if(!existsSync(path.join(dir,'PG_VERSION')))await pg.initialise();
await pg.start();
const client=pg.getPgClient();await client.connect();
const result=await client.query("SELECT 1 FROM pg_database WHERE datname='kunci'");
if(!result.rowCount)await pg.createDatabase('kunci');await client.end();
if(!existsSync('.env'))writeFileSync('.env',`DATABASE_URL="postgresql://kunci:${password}@127.0.0.1:55432/kunci?schema=public"\nAPP_PASSWORD=""\nSESSION_SECRET="${randomBytes(32).toString('hex')}"\n`);
console.log('PostgreSQL lokal aktif di 127.0.0.1:55432. Konfigurasi tersimpan di .env. Ctrl+C untuk berhenti.');
const stop=async()=>{await pg.stop();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},60000);
