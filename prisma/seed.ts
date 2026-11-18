import 'dotenv/config';
import { db } from '../src/lib/db';
import { insert } from '../src/lib/accounting';
const existing=await db.fiscalPeriod.count();
if(existing){console.log('Seed dilewati: database sudah berisi periode (tidak menimpa transaksi).');await db.$disconnect();process.exit(0);}
await db.$transaction(async tx=>{
 const data=[['111','Kas','ASET',true,null],['112','Piutang Usaha','ASET',false,null],['113','Perlengkapan','ASET',false,null],['211','Utang Usaha','KEWAJIBAN',false,null],['311','Modal Pemilik','EKUITAS',false,'CAPITAL'],['312','Prive','EKUITAS',false,'DRAWINGS'],['399','Ikhtisar Laba Rugi','EKUITAS',false,'INCOME_SUMMARY'],['411','Pendapatan Penjualan','PENDAPATAN',false,null],['511','Beban Listrik','BEBAN',false,null],['512','Beban Operasional Lainnya','BEBAN',false,null]] as const;
 for(const [code,name,category,isCash,role]of data)await tx.account.upsert({where:{id:code},update:{},create:{id:code,code,name,category,isCash,role,isSystemAccount:!!role,normalBalance:category==='ASET'||category==='BEBAN'?'DEBIT':'KREDIT'}});
 await tx.fiscalPeriod.upsert({where:{id:'demo-202612'},update:{},create:{id:'demo-202612',name:'Desember 2026',startDate:new Date('2026-12-01Z'),endDate:new Date('2026-12-31Z')}});

const line=(accountId:string,debit:string,credit:string)=>({accountId,debit,credit});
await insert(tx,'demo-202612',new Date('2026-12-01Z'),'OPENING','Saldo awal SIMULASI superprompt (termasuk beban historis)',[line('111','900','0'),line('112','1800','0'),line('211','0','1500'),line('311','0','2400'),line('512','1200','0')]);
for(const [date,description,a,b,value]of [['01','Penjualan tunai','111','411','2500'],['03','Pembelian perlengkapan','113','111','400'],['05','Pembayaran listrik','511','111','350'],['08','Pelunasan piutang','111','112','1200'],['12','Pembayaran utang','211','111','900']])await insert(tx,'demo-202612',new Date(`2026-12-${date}Z`),'GENERAL',description,[line(a,value,'0'),line(b,'0',value)],{cashActivity:'OPERATING'});
},{timeout:30000});
console.log('Seed simulasi selesai: neraca saldo 5.500, laba 950, aset 3.950.');await db.$disconnect();
