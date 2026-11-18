import ExcelJS from 'exceljs';import {readdirSync,writeFileSync} from 'node:fs';
const inspect=[];
for(const file of readdirSync('data/drive').filter(f=>f.endsWith('.xlsx'))){const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(`data/drive/${file}`);const sheets=wb.worksheets.map(s=>{const rows=[];s.eachRow((r,i)=>{if(rows.length<12)rows.push({row:i,cells:r.values});});return {sheet:s.name,rows:s.rowCount,cols:s.columnCount,preview:rows};});inspect.push({file,sheets});}
writeFileSync('data/drive-preview.json',JSON.stringify(inspect,null,2));
for(const f of inspect){console.log(JSON.stringify({file:f.file,sheets:f.sheets.map(s=>({name:s.sheet,rows:s.rows,cols:s.cols,preview:/1js5|1sTth|16T-/.test(f.file)?s.preview.slice(0,2):s.preview.slice(0,8)}))}));}
