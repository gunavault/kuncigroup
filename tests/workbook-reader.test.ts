import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readWorkbook} from '../scripts/workbook-reader.mjs';
test('table reader tolerates missing drawings, preserves cached values, errors and formulas without executing them',async()=>{
 const z=new JSZip();z.file('xl/workbook.xml','<workbook><sheets><sheet name="Data" r:id="r1"/></sheets></workbook>');z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>');z.file('xl/styles.xml','<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>');z.file('xl/sharedStrings.xml','<sst><si><t>Text source</t></si></sst>');z.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>2+2</f><v>4</v></c><c r="C1" t="e"><f>NA()</f><v>#N/A</v></c><c r="D1"><f>WEBSERVICE("https://example.test")</f></c><c r="E1" s="1"><v>46312</v></c></row></sheetData><drawing r:id="missing"/></worksheet>');
 const b=await readWorkbook(await z.generateAsync({type:'nodebuffer'})),s=b.sheets[0];assert.equal(s.value(1,1),'Text source');assert.equal(s.value(1,2),4);assert.equal(s.cell(1,2).formula,'2+2');assert.equal(s.cell(1,3).error,'#N/A');assert.equal(s.value(1,4),null);assert.ok(s.value(1,5) instanceof Date);
});
