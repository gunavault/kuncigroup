from pathlib import Path
from zipfile import ZipFile
import hashlib,json,xml.etree.ElementTree as ET,re
from pypdf import PdfReader
import os
root=Path(os.environ.get('SOURCE_DOWNLOADS',str(Path.home()/'Downloads')))
names=['MASTER ABSENSI ALL PROJECT OKTOBER 2026.xlsx','Master Data Asset - Project.xlsx','Data Stock - Project.xlsx','Master Data Aset Head Office - KBA.xlsx','Database Resource KBA 17 Nov 2026.xlsx','Kertas_Kerja_Akuntansi_KBA_2026 (2).xlsx','Panduan Operasional Kunci Group ERP.docx','Makalah_Kertas_Kerja_Akuntansi_KBA_2026 (2).docx','Makalah_Kertas_Kerja_Akuntansi_KBA_2026 (2).pptx','Makalah_Kertas_Kerja_Akuntansi_KBA_2026 (2).md','Makalah_Kertas_Kerja_Akuntansi_KBA_2026 (2).pdf']
dest=Path(os.environ.get('AUDIT_WORK_DIR','data/report-build-v4'));dest.mkdir(parents=True,exist_ok=True)
result=[]
for name in names:
 p=root/name
 if not p.is_file(): result.append({'name':name,'exists':False});continue
 raw=p.read_bytes(); r={'name':name,'exists':True,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 text=''
 if p.suffix in ['.docx','.pptx']:
  with ZipFile(p) as z:
   xmls=['word/document.xml'] if p.suffix=='.docx' else sorted((n for n in z.namelist() if re.match(r'ppt/slides/slide\d+.xml$',n)),key=lambda n:int(re.findall(r'\d+',n)[0]))
   pages=[]
   for n in xmls:
    node=ET.fromstring(z.read(n)); pages.append('\n'.join(e.text or '' for e in node.iter() if e.tag.endswith('}t')))
   r['parts']=len(pages);text='\n\n'.join(pages)
 elif p.suffix=='.pdf':
  pdf=PdfReader(p);r['pages']=len(pdf.pages);text='\n\n'.join(page.extract_text() or '' for page in pdf.pages)
 elif p.suffix=='.md':text=p.read_text(encoding='utf8')
 if text:
  (dest/(p.suffix[1:]+'-'+p.stem+'.txt')).write_text(text,encoding='utf8')
  r['textLength']=len(text);r['financialStatements']=[x.strip() for x in text.splitlines() if re.search(r'53[.,]321|4[.,]245|2[.,]000|9[.,]54|221|198|450|1[.,]459|20[.,]759|33 dari|101[.,]205',x)][:25]
 result.append(r)
(dest/'input-inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([{'name':r['name'],'exists':r['exists'],'parts':r.get('parts',r.get('pages'))} for r in result],ensure_ascii=False))
