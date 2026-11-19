from pathlib import Path
from zipfile import ZipFile
from decimal import Decimal,ROUND_HALF_UP
import xml.etree.ElementTree as E,json,hashlib,collections
import os
root=Path(os.environ.get('SOURCE_DOWNLOADS',str(Path.home()/'Downloads'))); base=Path(os.environ.get('AUDIT_WORK_DIR','data/report-build-v4'));base.mkdir(parents=True,exist_ok=True)
bundle=json.loads((base.parent/'upload-audit/import-v3.json').read_text(encoding='utf8'))
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(path):
 z=ZipFile(path); strings=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  st=E.fromstring(z.read('xl/sharedStrings.xml'));strings=[''.join(x.itertext()) for x in st]
 rel=E.fromstring(z.read('xl/_rels/workbook.xml.rels'));rels={x.attrib['Id']:x.attrib['Target'] for x in rel}
 w=E.fromstring(z.read('xl/workbook.xml'));out={}
 for sh in w.find('m:sheets',ns):
  dest=rels[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];dest=dest[1:] if dest.startswith('/') else 'xl/'+dest
  tree=E.fromstring(z.read(dest));cells={}
  for c in tree.findall('.//m:c',ns):
   v=c.find('m:v',ns);f=c.find('m:f',ns);text=v.text if v is not None else None;t=c.get('t','n')
   if t=='s':text=strings[int(text)] if text is not None else None
   elif t=='inlineStr':
    inline=c.find('m:is',ns);text=''.join(inline.itertext()) if inline is not None else None
   cells[c.attrib['r']]={'v':text,'type':t,'f':f.text if f is not None else None}
  out[sh.attrib['name']]=cells
 return out
q=lambda n:Decimal(str(n or '0')).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
checks=[];inputs=[];financial=None
for f in bundle['files']:
 p=root/f['name'];digest=hashlib.sha256(p.read_bytes()).hexdigest();book=workbook(p)
 errors=[{'sheet':s,'cell':a,'error':v['v']} for s,c in book.items() for a,v in c.items() if v['type']=='e']
 formulas=sum(1 for s,c in book.items() for v in c.values() if v['f'] is not None)
 inputs.append({'name':f['name'],'sha256':digest,'matchesImported':digest==f['sha256'],'sheets':len(book),'formulas':formulas,'formulaErrors':errors})
 if f['name'].startswith('Kertas_'): financial=book
checks.append({'name':'SHA256 enam workbook identik dengan sumber impor','population':len(inputs),'failed':sum(not x['matchesImported'] for x in inputs),'detail':'Berkas asli tidak berubah sejak impor.','lhs':None,'rhs':None,'difference':None,'unit':'file'})
debit=credit=Decimal(0);vouchers=collections.defaultdict(Decimal);mismatch=0;count=0
for f in bundle['facts']:
 if f['kind']!='FINANCIAL_JOURNAL':continue
 row=f['row'];cells=financial['JURNAL'];d=q(cells.get('H'+str(row),{}).get('v'));k=q(cells.get('I'+str(row),{}).get('v'));number=cells.get('A'+str(row),{}).get('v')
 debit+=d;credit+=k;vouchers[number]+=d-k;count+=1
 if d!=q(f.get('debit')) or k!=q(f.get('credit')):mismatch+=1
checks.append({'name':'JURNAL asli dibanding nilai normalisasi','population':count,'failed':mismatch,'detail':'Pembacaan XML independen, nilai cache asli dibanding sampai dua desimal. Tidak menjalankan makro atau instruksi dokumen.','lhs':float(debit),'rhs':float(credit),'difference':float(debit-credit),'unit':'IDR'})
checks.append({'name':'Voucher pada workbook asli seimbang','population':len(vouchers),'failed':sum(v!=0 for v in vouchers.values()),'detail':'Hitung ulang penjumlahan debit/kredit setiap voucher dari workbook asli.','lhs':None,'rhs':None,'difference':None,'unit':'voucher'})
diagnostic={}
for sheet,col in [('INV','L'),('TRS','J')]:
 rows=[f['row'] for f in bundle['facts'] if f['sheet']==sheet and f['kind']=='FINANCIAL_SOURCE']
 cells=financial[sheet];diagnostic[sheet]={'rows':len(rows),'formulas':list(dict.fromkeys(cells.get(col+str(r),{}).get('f') for r in rows))[:4]}
 if sheet=='INV':diagnostic[sheet]['modes']=sorted(set(str(cells.get('K'+str(r),{}).get('v')) for r in rows))
for sheet in ['INV','TRS']:
 cells=financial[sheet];rows=[f['row'] for f in bundle['facts'] if f['sheet']==sheet and f['kind']=='FINANCIAL_SOURCE' and isinstance(f['data'].get('cells',{}).get('1'),(int,float))];fail=[];left=right=Decimal(0)
 for r in rows:
  v=lambda col:cells.get(col+str(r),{}).get('v')
  if sheet=='INV':expected=q(v('H'))+(Decimal(0) if v('K')=='WAPU' else q(v('I')))-q(v('J'));actual=q(v('L'))
  else:expected=q(v('G'))+q(v('H'))-q(v('I'));actual=q(v('J'))
  left+=actual;right+=expected
  if expected!=actual:fail.append({'sheet':sheet,'row':r,'actual':float(actual),'expected':float(expected),'difference':float(actual-expected)})
 checks.append({'name':('Piutang neto invoice asli sesuai DPP, PPN dan PPh' if sheet=='INV' else 'Total treasury asli dibanding nominal + PPN - PPh'),'population':len(rows),'failed':len(fail),'detail':('WAPU persis: DPP-PPh. Non-WAPU: DPP+PPN-PPh. Tidak menetapkan tarif pajak baru.' if sheet=='INV' else 'Uji aritmetika kolom sumber, bukan bukti penerimaan barang atau pembayaran bank.'),'lhs':float(left),'rhs':float(right),'difference':float(left-right),'unit':'IDR','status':'PERLU TINJAUAN' if fail else 'SESUAI'})
 diagnostic[sheet]['differences']=fail
control=financial['CEK'];controlstatus=collections.Counter(v['v'] for a,v in control.items() if a.startswith('D') and a[1:].isdigit() and a!='D4');diagnostic['controlStatuses']=dict(controlstatus)
checks=[dict(c,status='PERLU TINJAUAN' if c['failed'] else 'SESUAI') for c in checks]
(base/'original-audit.json').write_text(json.dumps({'inputs':inputs,'checks':checks,'diagnostic':diagnostic},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'checks':checks,'diagnostic':diagnostic},ensure_ascii=False))
