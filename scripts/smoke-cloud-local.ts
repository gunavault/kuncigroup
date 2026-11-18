import { readFileSync } from 'node:fs';
const text=readFileSync('data/kunci-cloud-access.txt','utf8');
const password=text.match(/^Password aplikasi: (.+)$/m)?.[1].trim();
if(!password)throw new Error('File login lokal tidak ditemukan atau format tidak sesuai.');
process.env.APP_PASSWORD=password;
process.env.SMOKE_URL='http://localhost:8080';
await import('./smoke-production');
