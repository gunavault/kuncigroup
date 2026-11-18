import JSZip from 'jszip';
import {SaxesParser} from 'saxes';
import {readFileSync} from 'node:fs';
const local=n=>(typeof n==='string'?n:n.name).split(':').at(-1);
function xml(source,open,close,text){if(!source.trim())return;const p=new SaxesParser({xmlns:false});p.on('opentag',open);p.on('closetag',close);p.on('text',text);p.on('error',e=>{throw e;});p.write(source).close();}
const column=s=>[...s.toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);
const dates=new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
export async function readWorkbook(file){
 const bytes=typeof file==='string'?readFileSync(file):file,zip=await JSZip.loadAsync(bytes);let expanded=0;for(const f of Object.values(zip.files)){expanded+=f._data?.uncompressedSize??0;if(expanded>180*1024*1024)throw new Error('Workbook melebihi batas ekstraksi 180 MB.');}
 const read=async n=>zip.file(n)?zip.file(n).async('string'):'';
 const strings=[];let si=null,inT=false,phonetic=0;
 xml(await read('xl/sharedStrings.xml'),t=>{const n=local(t);if(n==='si')si='';if(n==='rPh')phonetic++;if(n==='t')inT=true;},t=>{const n=local(t);if(n==='si'){strings.push(si??'');si=null;}if(n==='t')inT=false;if(n==='rPh')phonetic--;},v=>{if(si!==null&&inT&&!phonetic)si+=v;});
 const formats=new Map(),styles=[];let inXfs=false;
 xml(await read('xl/styles.xml'),t=>{const n=local(t),a=t.attributes;if(n==='numFmt')formats.set(Number(a.numFmtId),String(a.formatCode??''));if(n==='cellXfs')inXfs=true;if(n==='xf'&&inXfs)styles.push(Number(a.numFmtId??0));},t=>{if(local(t)==='cellXfs')inXfs=false;},()=>{});
 const relations=new Map();xml(await read('xl/_rels/workbook.xml.rels'),t=>{if(local(t)==='Relationship')relations.set(t.attributes.Id,t.attributes.Target);},()=>{},()=>{});
 const metas=[];let date1904=false;xml(await read('xl/workbook.xml'),t=>{const n=local(t);if(n==='workbookPr')date1904=['1','true'].includes(t.attributes.date1904);if(n==='sheet')metas.push({name:t.attributes.name,state:t.attributes.state??'visible',id:t.attributes['r:id']});},()=>{},()=>{});
 const sheets=[];
 for(const meta of metas){let target=relations.get(meta.id);if(!target)throw new Error('Relasi worksheet tidak tersedia.');target=target.startsWith('/')?target.slice(1):'xl/'+target;target=target.replaceAll('/./','/');if(!target.startsWith('xl/')||target.includes('../'))throw new Error('Lokasi worksheet tidak valid.');
  const rows=new Map(),merges=[];let current=null,inValue=false,inFormula=false,inInline=false;
  xml(await read(target),t=>{const n=local(t),a=t.attributes;if(n==='c'){const address=String(a.r??''),match=/^([A-Za-z]+)([0-9]+)$/.exec(address);if(!match)return;current={address,col:column(match[1]),row:Number(match[2]),type:a.t??'',style:Number(a.s??0),raw:'',formula:null,hasValue:false,inline:''};}if(n==='v'&&current){inValue=true;current.hasValue=true;}if(n==='f'&&current){inFormula=true;current.formula='';current.sharedFormula=a.si??null;}if(n==='t'&&current)inInline=true;if(n==='mergeCell'&&a.ref)merges.push(String(a.ref));},t=>{const n=local(t);if(n==='v')inValue=false;if(n==='f')inFormula=false;if(n==='t')inInline=false;if(n==='c'&&current){const c=current;let value=null;if(c.type==='s')value=strings[Number(c.raw)]??'';else if(c.type==='inlineStr')value=c.inline;else if(c.type==='str')value=c.raw;else if(c.type==='b')value=c.raw==='1';else if(c.type==='e'){c.error=c.raw;value=null;}else if(c.raw!==''){const num=Number(c.raw);value=Number.isFinite(num)?num:c.raw;}const formatId=styles[c.style]??0;c.numFmt=formats.get(formatId)??'';const cleaned=c.numFmt.replace(/"[^"]*"|\[[^\]]*\]|\\./g,'');if(typeof value==='number'&&(dates.has(formatId)||/[ymdhis]/i.test(cleaned))){c.serial=value;const date=new Date((date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30))+Math.round(value*86400000));if(!Number.isNaN(date.getTime()))value=date;}
    c.value=value;if(value!==null&&value!==''||c.formula!==null){if(!rows.has(c.row))rows.set(c.row,new Map());rows.get(c.row).set(c.col,c);}current=null;}},v=>{if(current){if(inValue)current.raw+=v;if(inFormula)current.formula+=v;if(inInline)current.inline+=v;}});
  const ordered=[...rows].sort(([a],[b])=>a-b).map(([number,cells])=>({number,cells}));
  const cell=(r,c)=>rows.get(r)?.get(c)??{value:null};
  sheets.push({...meta,rows:ordered,merges,rowCount:Math.max(0,...rows.keys()),columnCount:Math.max(0,...ordered.map(r=>Math.max(...r.cells.keys()))),cell,value:(r,c)=>cell(r,c).value});
 }
 return {sheets,date1904,bytes:bytes.length};
}
