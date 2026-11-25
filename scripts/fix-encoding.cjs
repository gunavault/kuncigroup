const fs = require('fs'); const path = require('path');
function visit(dir) { for(const d of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,d.name); if(d.isDirectory())visit(p);else{const b=fs.readFileSync(p);if(b[0]===239&&b[1]===187&&b[2]===191)fs.writeFileSync(p,b.subarray(3));} } }
for(const dir of ['src','prisma','scripts'])visit(dir);
let p='src/lib/accounting.ts';let s=fs.readFileSync(p,'utf8');s=s.replace('status:entry.status}}}); return entry;','status:extra.status??"POSTED"}}});\n  if(extra.status!=="DRAFT") return tx.journalEntry.update({where:{id:entry.id},data:{status:"POSTED"},include});\n  return entry;');s=s.replace('...extra,journalNumber:', '...extra,status:"DRAFT",journalNumber:');fs.writeFileSync(p,s);
