/** Private reports. Requires the supplied artifact runtime, not application dependencies. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const runtime = process.env.RUNTIME_NODE_MODULES;
if (!runtime) throw new Error('Set RUNTIME_NODE_MODULES to the supplied artifact runtime.');
const requireRuntime = createRequire(path.join(runtime, '__runtime__.cjs'));
const { Workbook, SpreadsheetFile, Presentation, PresentationFile } = await import(pathToFileURL(requireRuntime.resolve('@oai/artifact-tool')).href);
const work = path.resolve('data/report-build-v4'), output = path.resolve(process.env.REPORT_OUTPUT ?? 'outputs/erp-review-20261119');
const report = JSON.parse(await fs.readFile(process.env.REPORT_DATA ?? 'data/audit-v4/report-data.json','utf8'));
const original = JSON.parse(await fs.readFile(path.join(work,'original-audit.json'),'utf8'));
const inputs = JSON.parse(await fs.readFile(path.join(work,'input-inventory.json'),'utf8'));
await fs.mkdir(output,{recursive:true}); await fs.mkdir(path.join(work,'previews'),{recursive:true});
const treasuryDifference=original.diagnostic.TRS.differences.reduce((a,r)=>a+r.difference,0);
const S=report.summary, green='#185E49', dark='#18342C', gray='#57665F', pale='#EAF2EE', amber='#FFF3D6';
const dateStamp=(process.env.REPORT_DATE ?? S.capturedAt.slice(0,10)).replaceAll('-','');
const dateLabel=new Date((process.env.REPORT_DATE ?? S.capturedAt.slice(0,10))+'T00:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const revisionCount=report.sourceIssues.filter(r=>r.rule==='REVISI DRIVE 23-NOV-2026').length;
const integer=n=>new Intl.NumberFormat('id-ID').format(n);
const idr=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:2}).format(n);
const amountFormat='#,##0.00;(#,##0.00);"–"';
const workbook=Workbook.create();
const names=['Ringkasan','Master kosong','Transaksi kosong','Temuan sumber','Selisih nominal','Rekonsiliasi','Sumber dan cakupan'];
const sheets=Object.fromEntries(names.map(n=>[n,workbook.worksheets.add(n)]));
function base(sheet,title,lastCol='H',lastRow=18){
 sheet.showGridLines=false;sheet.getRange(`A1:${lastCol}${lastRow}`).format.font={name:'Arial',size:10,color:dark};
 sheet.getRange('A2').values=[[title]];sheet.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:dark};
 sheet.getRange(`A4:${lastCol}4`).format.borders={bottom:{style:'thin',color:green}};
 sheet.getRange(`A1:${lastCol}${lastRow}`).format.verticalAlignment='center';
}
function table(sheet,headers,rows,tableName,widths){
 const last=String.fromCharCode(64+headers.length),end=Math.max(6,rows.length+5);
 base(sheet,sheet.name,last,end); sheet.getRange(`A5:${last}5`).values=[headers];
 if(rows.length) sheet.getRange(`A6:${last}${end}`).values=rows.map(r=>r.map(v=>typeof v==='string'&&v.startsWith('=')?"'"+v:v));
 sheet.getRange(`A5:${last}5`).format={fill:green,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:32,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
 sheet.getRange(`A6:${last}${end}`).format.rowHeight=48;sheet.getRange(`A6:${last}${end}`).format.wrapText=true;
 widths.forEach((w,i)=>sheet.getRange(`${String.fromCharCode(65+i)}5:${String.fromCharCode(65+i)}${end}`).format.columnWidth=w);
 const t=sheet.tables.add(`A5:${last}${end}`,true,tableName);t.showFilterButton=true;
 sheet.freezePanes.freezeRows(5);sheet.freezePanes.freezeColumns(3);
 return end;
}
const fields=['company','kind','code','field','rule','priority','owner','action','source','status','assignee','targetDate','resolution'];
const headers=['Perusahaan','Jenis','Kode / lokasi','Kolom / temuan','Dasar pemeriksaan','Prioritas','Penanggung jawab','Tindakan','Lokasi sumber','Status','PIC ditetapkan','Target selesai','Hasil tindak lanjut'];
const widths=[13,19,32,30,25,13,25,65,70,16,25,18,60];
for(const [name,key] of [['Master kosong','masterGaps'],['Transaksi kosong','transactionGaps'],['Temuan sumber','sourceIssues']]){
 const rows=report[key];const end=table(sheets[name],headers,rows.map(r=>fields.map(f=>r[f]??'')),key,widths);
 sheets[name].getRange('A3').values=[['Satu baris = satu kolom/temuan. Satu dokumen dapat memiliki beberapa temuan. Isian PIC, target dan hasil berwarna kuning.']];
 sheets[name].getRange(`K6:M${end}`).format.fill=amber;
 sheets[name].getRange(`L6:L${end}`).setNumberFormat('dd-mmm-yyyy');
 sheets[name].getRange(`J6:J${end}`).dataValidation={rule:{type:'list',values:['TERBUKA','DIPROSES','SELESAI','DITOLAK DENGAN ALASAN']}};
 sheets[name].getRange(`F6:F${end}`).conditionalFormats.add('containsText',{text:'TINGGI',format:{fill:'#FCE8E6',font:{color:'#A12822',bold:true}}});
 sheets[name].getRange(`J6:J${end}`).conditionalFormats.add('containsText',{text:'SELESAI',format:{fill:'#E3F1E9',font:{color:green}}});
}
const nominal=[...report.nominalDifferences.map(n=>[n.company,n.module,n.document,n.status,n.sourceAmount,n.computedTotal,n.difference,'ERP: rincian + pajak',n.source]),
 ...original.diagnostic.TRS.differences.map(n=>['KBA','Treasury',`TRS!${n.row}`,'SUMBER',n.actual,n.expected,n.difference,'Nominal sumber + PPN - PPh','Kertas_Kerja_Akuntansi_KBA_2026 (2).xlsx'])];
const nominalEnd=table(sheets['Selisih nominal'],['Perusahaan','Modul','Dokumen / baris','Status','Nilai tercatat (IDR)','Hitung ulang (IDR)','Selisih (IDR)','Dasar','Sumber'],nominal,'Nominal',[14,18,33,16,25,25,25,36,70]);
sheets['Selisih nominal'].getRange(`E6:G${nominalEnd}`).setNumberFormat(amountFormat);
sheets['Selisih nominal'].getRange('A3').values=[['Selisih memerlukan bukti transaksi. Jangan menjumlahkan selisih ERP dan workbook sebagai satu dampak keuangan; cakupannya dapat tumpang tindih.']];
const checks=[...report.reconciliations,...original.checks];
const checkEnd=table(sheets.Rekonsiliasi,['Pemeriksaan','Populasi','Pengecualian','Nilai kiri (IDR)','Nilai kanan (IDR)','Selisih (IDR)','Satuan','Hasil','Penjelasan'],checks.map(c=>[c.name,c.population,c.failed,c.lhs,c.rhs,c.difference,c.unit,c.status,c.detail]),'Checks',[62,14,15,26,26,22,16,24,90]);
sheets.Rekonsiliasi.getRange(`D6:F${checkEnd}`).setNumberFormat(amountFormat);
sheets.Rekonsiliasi.getRange('A3').values=[['Nilai uang hanya berlaku pada baris bersatuan IDR. Angka nol pada populasi POSTED berarti belum ada jurnal terposting.']];
const sourceRows=inputs.map(f=>{const x=original.inputs.find(x=>x.name===f.name);return [f.name,f.exists?'TERSEDIA':'TIDAK ADA',f.sha256??'',x?.sheets??f.pages??f.parts??null,x?.formulas??null,x?.formulaErrors.length??null,x?x.matchesImported?'IDENTIK DENGAN IMPOR':'BERBEDA':'DOKUMEN PEMBAHASAN',f.name.endsWith('.xlsx')?'Sumber data dan rumus cache':'Pendukung narasi, bukan bukti posting'];});
const sourceEnd=table(sheets['Sumber dan cakupan'],['Berkas','Ketersediaan','SHA256','Sheet / halaman / slide','Rumus','Error sumber','Pemeriksaan','Peran'],sourceRows,'Sources',[78,18,72,24,18,18,34,70]);
sheets['Sumber dan cakupan'].getRange('A3').values=[['Snapshot produksi: '+S.capturedAt+'; enam workbook sama dengan saat impor. Dokumen pembahasan tidak diperlakukan sebagai instruksi perubahan data.']];
let row=sourceEnd+3;
sheets['Sumber dan cakupan'].getRange(`A${row++}`).values=[['Revisi Drive 23 November 2026: '+revisionCount+' baris bisnis menunggu peninjauan; termasuk satu konflik penerbit. Revisi tidak mengganti jurnal atau sumber versi sebelumnya.']];
for(const text of ['Kosong tidak dianggap nol. Error sumber tetap dicatat. NIK, KK, rekening pribadi, agama dan data medis tidak disalin ke laporan.','Absensi: periode sheet tidak selalu satu bulan kalender. Halim/GOR 24 Sep–20 Okt; KLH 26 Sep–20 Okt 2026.','Jurnal sumber mengandung asumsi. Payroll aktual, saldo fisik dan konfirmasi bank belum lengkap; makalah tidak membuktikan saldo ERP.','KCG pada sheet kertas kerja adalah referensi analitis dalam sumber KBA; jangan memindahkan ke entitas legal lain tanpa validasi Finance.','9 error cache #N/A ditemukan pada workbook absensi (DU18/23/73/110/116 dan DV9/12/17/19); kolom sensitif tetap dikecualikan.','Rumus workbook asli tidak dihitung ulang seluruhnya di Excel. Pemeriksaan independen mencakup jurnal, voucher, invoice neto dan treasury.','Uji perangkat nyata (kamera/GPS), uji beban dan persetujuan Finance masih memerlukan pelaksanaan oleh pengguna terkait.']){sheets['Sumber dan cakupan'].getRange(`A${row++}`).values=[[text]];}
base(sheets.Ringkasan,'Rekap kelengkapan data Kunci Group','H',40);sheets.Ringkasan.tabColor=green;
sheets.Ringkasan.getRange('A3').values=[['Audit '+dateLabel+'. Populasi operasional mengecualikan DEMO; data historis tetap dipisahkan dari roster terkini.']];
const summaryRows=[['Indikator','Jumlah','Satuan','Makna'],['Master diperiksa',S.masters,'record','Seluruh perusahaan operasional dan KBL nonaktif'],['Dokumen diperiksa',S.records,'dokumen','Data ERP dalam snapshot; bukan jumlah voucher workbook'],['Baris sumber',S.sourceFacts,'baris','Termasuk detail, ringkasan dan referensi'],['Kolom/temuan master',null,'temuan','Jumlah baris pada Master kosong'],['Master terdampak',S.masterRecordsAffected,'record unik','Satu master dapat memiliki beberapa kolom kosong'],['Kolom/temuan transaksi',null,'temuan','Jumlah baris pada Transaksi kosong'],['Dokumen terdampak',S.transactionRecordsAffected,'dokumen unik','Termasuk status impor yang menunggu verifikasi'],['Temuan sumber',null,'temuan','Tidak dijumlahkan sebagai tambahan transaksi ERP'],['Roster terkini',S.currentRoster,'orang',`${S.activeRoster} aktif; ${S.currentRoster-S.activeRoster} nonaktif sesuai tanggal sumber`],['Referensi di luar roster',S.historicalEmployees,'record','Termasuk '+S.historicalUploaded+' identitas historis dari unggahan baru'],['Absensi tidak diketahui',S.unknownAttendance,'hari-personel','Tidak diubah menjadi hadir atau alpha'],['Hari perlu verifikasi identitas',S.identityReviewDays,'hari-personel','Relasi teknis ada; identitas sumber masih memerlukan bukti'],['Stok aritmetika sesuai',S.stockCorrect,'baris','Belum berarti stok fisik atau nilai persediaan terverifikasi'],['Stok perlu tinjauan',S.stockIncomplete+S.stockDifference,'baris','Saldo/mutasi belum lengkap atau berbeda'],['Selisih total dokumen ERP',report.nominalDifferences.length,'dokumen','Rincian/pajak impor memerlukan verifikasi'],['Selisih aritmetika treasury',original.diagnostic.TRS.differences.length,'baris',`Total selisih tercatat ${idr(treasuryDifference)}; butuh bukti`],['Voucher sumber seimbang',S.sourceVouchers,'voucher','4.245 baris jurnal pada workbook'],['Debit sumber',S.sourceDebit,'IDR','Perputaran jurnal, bukan omzet atau kas'],['Kredit sumber',S.sourceCredit,'IDR','Sama dengan debit sumber']];
sheets.Ringkasan.getRange('A5:D24').values=summaryRows;
sheets.Ringkasan.getRange('B9').formulas=[[`=COUNTA('Master kosong'!C6:C${report.masterGaps.length+5})`]];
sheets.Ringkasan.getRange('B11').formulas=[[`=COUNTA('Transaksi kosong'!C6:C${report.transactionGaps.length+5})`]];
sheets.Ringkasan.getRange('B13').formulas=[[`=COUNTA('Temuan sumber'!C6:C${report.sourceIssues.length+5})`]];
sheets.Ringkasan.getRange('B23:B24').setNumberFormat(amountFormat);
sheets.Ringkasan.getRange('A5:D5').format={fill:green,font:{name:'Arial',bold:true,color:'#FFFFFF'},rowHeight:28};
for(const [col,w]of [['A',41],['B',25],['C',20],['D',98]])sheets.Ringkasan.getRange(`${col}5:${col}40`).format.columnWidth=w;
sheets.Ringkasan.getRange('A6:D24').format.rowHeight=28;sheets.Ringkasan.getRange('B6:B22').setNumberFormat('#,##0');
sheets.Ringkasan.getRange('A27:F27').values=[['Perusahaan','Jurnal POSTED','Debit (IDR)','Kredit (IDR)','Laba buku besar (IDR)','Lot stok operasional']];
sheets.Ringkasan.getRange('A28:F31').values=S.financial.map(f=>[f.company,f.posted,f.debit,f.credit,f.profit,f.lots]);
sheets.Ringkasan.getRange('A27:F27').format={fill:green,font:{color:'#FFFFFF',bold:true},wrapText:true,rowHeight:42};sheets.Ringkasan.getRange('C28:E31').setNumberFormat(amountFormat);
sheets.Ringkasan.getRange('A34').values=[['Kuning: PIC, target, dan hasil tindak lanjut dapat diisi. Status dapat difilter. Angka ringkasan menghitung temuan, bukan jumlah orang atau transaksi tambahan.']];
workbook.recalculate();
const inspection=await workbook.inspect({kind:'table',range:'Ringkasan!A5:D24',include:'values,formulas',tableMaxRows:22,tableMaxCols:4,maxChars:4000});
await fs.writeFile(path.join(work,'workbook-inspection.ndjson'),inspection.ndjson);
const formulaErrors=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:40},maxChars:2000});
await fs.writeFile(path.join(work,'workbook-errors.ndjson'),formulaErrors.ndjson);
for(const name of names){const preview=await workbook.render({sheetName:name,range:name==='Ringkasan'?'A1:D24':'A1:H11',scale:1.25,format:'png'});await fs.writeFile(path.join(work,'previews',name+'.png'),new Uint8Array(await preview.arrayBuffer()));}
const xlsx=path.join(output,`Rekap_Kekosongan_Data_Kunci_Group_${dateStamp}.xlsx`);await(await SpreadsheetFile.exportXlsx(workbook)).save(xlsx);

// Editable presentation: plain composition, native tables, source notes.
const presentation=Presentation.create({slideSize:{width:1280,height:720}}),nativeTableSlides=[];
const font='Arial';
function text(slide,content,left,top,width,height,size=24,color=dark,bold=false){const shape=slide.shapes.add({geometry:'textbox',position:{left,top,width,height},fill:'none',line:{fill:'none',width:0}});shape.text=content;shape.text.style={typeface:font,fontSize:size,color,bold,verticalAlignment:'top',wrap:'square',insets:0};return shape;}
function slide(title,subtitle=''){const s=presentation.slides.add();s.background.fill='#FFFFFF';text(s,title,64,42,1152,92,40,dark,true);if(subtitle)text(s,subtitle,64,135,1152,58,22,gray);text(s,String(presentation.slides.items.length).padStart(2,'0'),1170,672,48,25,15,gray);s.speakerNotes.text='Sumber: snapshot produksi '+S.capturedAt+'; enam workbook unggahan 19 November 2026. Detail record dan lokasi bukti tersedia pada Excel pendamping. DEMO dikecualikan dari populasi operasional.';return s;}
function nativeTable(s,headers,rows,cols,top=214,height=340){const t=s.tables.add({rows:rows.length+1,columns:headers.length,left:64,top,width:1152,height,values:[headers,...rows],columnWidths:cols});for(let r=0;r<rows.length+1;r++)for(let c=0;c<headers.length;c++){const cell=t.getCell(r,c);cell.fill=r===0?green:r%2?'#F0F5F2':'#FFFFFF';cell.text.style={typeface:font,fontSize:r===0?23:22,bold:r===0,color:r===0?'#FFFFFF':dark,verticalAlignment:'middle',insets:12};}t.borders.assign({style:'solid',fill:'#DDE7E1',width:0.6});nativeTableSlides.push(presentation.slides.items.length);return t;}
let s=slide('Kelengkapan data Kunci Group');text(s,'Audit transaksi dan master data',64,220,1100,85,52,green,true);text(s,dateLabel,64,334,1050,44,28,gray);text(s,`${integer(S.masters)} master dan ${integer(S.records)} dokumen ERP\n${integer(S.sourceFacts)} baris sumber`,64,439,1080,110,30,dark);text(s,'Daftar tindak lanjut lengkap tersedia dalam Excel pendamping',64,609,1120,38,21,gray);
s=slide('Cakupan pemeriksaan','Database produksi dan sumber unggahan memiliki butir data yang berbeda');nativeTable(s,['Populasi','Jumlah','Makna'],[['Master',integer(S.masters),'Termasuk katalog dan register historis'],['Dokumen ERP',integer(S.records),'Draft dan impor perlu dipisahkan dari posting'],['Baris sumber',integer(S.sourceFacts),'Detail, ringkasan dan referensi'],['Workbook asli','6 file','Hash identik dengan saat impor'],['Dokumen pembahasan','5 file','DOCX, PDF, MD dan PPTX']],[340,190,622],214,340);
s=slide('Kelengkapan master dan transaksi','Jumlah temuan berbeda dari jumlah record yang terdampak');nativeTable(s,['Register','Temuan kolom / status','Record terdampak'],[['Master',integer(S.masterFieldsMissing),integer(S.masterRecordsAffected)],['Transaksi',integer(S.transactionFieldsMissing),integer(S.transactionRecordsAffected)],['Sumber',integer(S.sourceFindings),'Lihat lokasi bukti di Excel']],[330,400,422],222,245);text(s,'Status impor yang belum diverifikasi ikut dihitung sebagai temuan. Kolom persiapan operasional dibedakan dari kolom wajib formulir.',64,505,1140,95,27,gray);
const topMaster=Object.entries(report.masterGaps.reduce((a,g)=>(a[g.field]=(a[g.field]??0)+1,a),{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
s=slide('Kolom master yang memerlukan tindak lanjut');nativeTable(s,['Kolom / kondisi','Jumlah temuan'],topMaster.map(([k,v])=>[k,integer(v)]),[870,282],180,430);
s=slide('Roster dan identitas historis','ID kerja menjadi dasar pemadanan. Kesamaan nama tidak menggabungkan dua personel');nativeTable(s,['Indikator','Jumlah','Tindak lanjut'],[['Roster terkini',integer(S.currentRoster),`${integer(S.activeRoster)} aktif sesuai sumber`],['Di luar roster terkini',integer(S.historicalEmployees),'Tidak ditambahkan ke jumlah roster aktif'],['Historis dari unggahan baru',integer(S.historicalUploaded),'HR memverifikasi identitas dan penempatan'],['Hari perlu verifikasi identitas',integer(S.identityReviewDays),'Relasi teknis belum membuktikan identitas'],['Hari tidak diketahui',integer(S.unknownAttendance),'Konfirmasi sumber tanpa mengarang hadir/alpha']],[530,160,462],210,350);
s=slide('Stok dan register aset','Saldo kuantitas sumber belum membuktikan stok fisik atau biaya perolehan');nativeTable(s,['Stok sumber','Baris','Interpretasi'],[['Aritmetika sesuai',integer(S.stockCorrect),'Saldo awal dan mutasi cocok'],['Belum lengkap',integer(S.stockIncomplete),'Saldo awal/akhir atau mutasi perlu bukti'],['Selisih aritmetika',integer(S.stockDifference),'Cocokkan mutasi dan hasil stok fisik']],[460,150,542],217,245);text(s,'Harga RAB/sewa tetap menjadi referensi. Finance perlu faktur biaya, tanggal perolehan dan bukti stok sebelum pembukaan saldo.',64,515,1150,102,27,gray);
s=slide('Jurnal dan invoice sumber teruji','Pengujian aritmetika tidak menggantikan verifikasi bukti transaksi');nativeTable(s,['Pemeriksaan','Populasi','Pengecualian'],[['Jurnal asli vs normalisasi','4.245 baris','0'],['Voucher seimbang','2.000 voucher','0'],['Invoice neto: WAPU / Non-WAPU','53 baris invoice','0'],['Sumber unggahan awal vs database','20.759 baris','0']],[690,245,217],214,315);text(s,`Debit dan kredit sumber masing-masing ${idr(S.sourceDebit)}. Nilai ini adalah perputaran jurnal.`,64,566,1140,64,25,gray);
s=slide(`${original.diagnostic.TRS.differences.length} baris treasury berbeda ${idr(Math.abs(treasuryDifference))}`,'Nilai sumber tetap dipertahankan sampai Finance memeriksa bukti');nativeTable(s,['Lokasi','Total tercatat','Nominal + PPN − PPh','Selisih'],original.diagnostic.TRS.differences.map(n=>[`TRS!${n.row}`,idr(n.actual),idr(n.expected),idr(n.difference)]),[180,310,390,272],240,195);text(s,'Selisih dapat berasal dari diskon, koreksi, atau input yang belum dijelaskan. Faktur dan bukti pembayaran menentukan perlakuan akhirnya.',64,487,1140,124,28,gray);
s=slide(`${report.nominalDifferences.length} dokumen impor memerlukan verifikasi`,'Nilai dokumen belum seluruhnya cocok dengan rincian dan pajak');text(s,String(report.nominalDifferences.length),64,220,300,170,116,green,true);text(s,'dokumen ERP',67,389,400,52,32,dark,true);text(s,'Daftar Excel memuat nomor dokumen, nilai tercatat, hitung ulang dan selisih. Semua dokumen terkait tetap berada pada status impor.',500,230,700,206,31,dark);text(s,'Selisih ERP dan selisih treasury memiliki cakupan berbeda. Keduanya tidak dijumlahkan sebagai satu kerugian.',64,539,1140,86,27,gray);
s=slide(S.financial.some(f=>f.posted>0)?'Buku besar dan kualitas pembukuan':'Buku besar belum diposting','Status pembukuan diambil dari snapshot terbaru');nativeTable(s,['Perusahaan','Jurnal POSTED','Debit / kredit','Lot stok'],S.financial.map(f=>[f.company,String(f.posted),idr(f.debit)+' / '+idr(f.credit),String(f.lots)]),[270,250,412,220],217,300);text(s,'Jurnal historis dan koreksi v6.2 telah dibukukan. Laporan KBA masih DRAFT; estimasi payroll, penampung dan rekonsiliasi bank memerlukan bukti serta sign-off.',64,558,1140,85,27,gray);
s=slide('Ringkasan tersedia pada seluruh 19 modul','Setiap modul menampilkan 4–6 kartu di atas area kerja');nativeTable(s,['Jenis modul','Isi ringkasan'],[['Transaksi','Jumlah lengkap, status workflow dan nominal jurnal POSTED'],['SDM / absensi','Roster terkini dan register sumber dengan cakupan akses'],['Inventory / Barcode','Produk, gudang, lot, karantina dan kedaluwarsa'],['Accounting / Dashboards','Debit, kredit dan laba dari jurnal terposting'],['Discuss / Apps / Settings','Pesan, aktivasi aplikasi dan pengguna yang diizinkan']],[370,782],214,340);
s=slide('Urutan penyelesaian data','PIC, target, status dan hasil dapat diisi langsung pada Excel');nativeTable(s,['Penanggung jawab','Pekerjaan','Bukti selesai'],[['Finance','13 dokumen ERP dan 2 baris treasury','Faktur, rincian, pajak dan persetujuan'],['HR','Identitas historis dan hari tidak diketahui','ID kerja dan konfirmasi supervisor'],['Logistik','74 baris stok dan register aset','Stok fisik, faktur, pemegang aset'],['Administrator','Akun individual, atasan dan cakupan','Uji akses sesuai peran dan cabang']],[250,510,392],215,305);text(s,'Tutup temuan setelah bukti lengkap dan peninjau menyetujui. Kamera/GPS perangkat nyata, uji beban dan UAT Finance tetap menjadi tahapan penerimaan.',64,559,1140,96,26,gray);
for(let i=0;i<presentation.slides.items.length;i++){const blob=await presentation.export({slide:presentation.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(work,'previews',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));}
const candidate=path.join(work,'audit-draft.pptx');await(await PresentationFile.exportPptx(presentation)).save(candidate);
const skill=process.env.PRESENTATION_SKILL_DIR;if(!skill)throw new Error('Set PRESENTATION_SKILL_DIR for mandatory finalization.');
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const finalPath=path.join(output,`Rekap_Kekosongan_Data_Kunci_Group_${dateStamp}.pptx`);
const finalized=await finalizePresentation({workspaceDir:path.resolve(process.env.REPORT_WORKSPACE ?? '..'),candidatePath:candidate,finalPath,pythonExecutable:process.env.RUNTIME_PYTHON,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...nativeTableSlides.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:nativeTableSlides,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(work,'presentation-validation.json')});
await fs.writeFile(path.join(work,'deliverable-validation.json'),JSON.stringify({xlsx,slides:presentation.slides.items.length,finalized,findings:{master:report.masterGaps.length,transactions:report.transactionGaps.length,source:report.sourceIssues.length},snapshot:S.capturedAt},null,2));
console.log(JSON.stringify({xlsx,pptx:finalPath,slides:presentation.slides.items.length,sheets:names.length}));
