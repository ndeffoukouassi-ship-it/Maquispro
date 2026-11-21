import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueFile } from '../web-firebase/src/catalog-export.js';

const sample=[
  {name:'Castel 65 cl',buy:550,sell:650},
  {name:'Coca & Cola <30 cl>',buy:300,sell:450}
];
async function archiveEntries(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const view=new DataView(bytes.buffer);
  const decoded=new TextDecoder();
  const result={};
  let offset=0,files=0;
  while(offset+4<bytes.length && view.getUint32(offset,true)===0x04034b50){
    const method=view.getUint16(offset+8,true);
    assert.equal(method,0,'ZIP stocké sans compression');
    const size=view.getUint32(offset+18,true);
    const nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    const name=decoded.decode(bytes.subarray(offset+30,offset+30+nameLength));
    const start=offset+30+nameLength+extra;
    result[name]=decoded.decode(bytes.subarray(start,start+size));
    offset=start+size;files++;
  }
  assert.ok(files>=3,'Le fichier est une archive ZIP OOXML');
  assert.equal(view.getUint32(offset,true),0x02014b50,'Répertoire central ZIP présent');
  return result;
}
test('Excel natif : prix d’achat et de vente, XML propre',async()=>{
  const file=createCatalogueFile(sample,'Maquis Buzz VIP','xlsx');
  assert.equal(file.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const entries=await archiveEntries(file);
  assert.ok(entries['xl/workbook.xml']);
  assert.ok(entries['xl/styles.xml']);
  const sheet=entries['xl/worksheets/sheet1.xml'];
  assert.match(sheet,/Castel 65 cl/);
  assert.match(sheet,/<v>550<\/v>/);
  assert.match(sheet,/<v>650<\/v>/);
  assert.match(sheet,/Coca &amp; Cola &lt;30 cl&gt;/);
  assert.match(sheet,/Maquis Buzz VIP/);
});
test('Word DOCX : tableau des boissons et prix, XML échappé',async()=>{
  const file=createCatalogueFile(sample,'Maquis Buzz VIP','docx');
  assert.equal(file.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const entries=await archiveEntries(file);
  const doc=entries['word/document.xml'];
  assert.ok(doc);
  assert.match(doc,/Castel 65 cl/);
  assert.match(doc,/550/);
  assert.match(doc,/650/);
  assert.match(doc,/Coca &amp; Cola &lt;30 cl&gt;/);
  assert.match(doc,/Maquis Buzz VIP/);
});
test('Aucun catalogue vide ne peut être exporté',()=>{
  assert.throws(()=>createCatalogueFile([],'Maquis','xlsx'),/Ajoute/);
});
test('Conserver les prix exacts après tri alphabétique',async()=>{
  const entries=await archiveEntries(createCatalogueFile(sample,'Maquis','xlsx'));
  const sheet=entries['xl/worksheets/sheet1.xml'];
  const id=sheet.indexOf('Castel 65 cl');
  assert.ok(id>=0);
  const row=sheet.slice(sheet.lastIndexOf('<row',id),sheet.indexOf('</row>',id));
  assert.match(row,/<v>550<\/v>/);
  assert.match(row,/<v>650<\/v>/);
});
