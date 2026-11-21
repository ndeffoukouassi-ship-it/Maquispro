/* MaquisPro - Export XLSX / DOCX natifs (sans service externe). */
const encoder=new TextEncoder();
const xmlEscape=value=>String(value??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const number=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
const digits=n=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0}).format(n);
const safeFilename=text=>String(text||"MaquisPro").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,48)||"MaquisPro";
const dateStamp=()=>new Date().toISOString().slice(0,10);
const DATA_LIMIT=5000;
function normalizedProducts(input){
  if(!Array.isArray(input)||input.length>DATA_LIMIT)throw new Error("Catalogue invalide ou trop volumineux");
  return input.map((p,i)=>({index:i+1,name:String(p.name??p.nom??"Boisson sans nom").slice(0,200),buy:number(p.buy??p.prixAchat),sell:number(p.sell??p.prixVente)}))
    .sort((a,b)=>a.name.localeCompare(b.name,"fr",{sensitivity:"base"}))
    .map((x,i)=>({...x,index:i+1}));
}
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let k=0;k<8;k++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function zip(files,mime){
  const localParts=[],centralParts=[];let offset=0,centralSize=0;
  for(const [name,content] of Object.entries(files)){
    const n=encoder.encode(name),d=encoder.encode(content),crc=crc32(d);
    const local=new Uint8Array(30+n.length+d.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,d.length,true);lv.setUint32(22,d.length,true);
    lv.setUint16(26,n.length,true);local.set(n,30);local.set(d,30+n.length);
    localParts.push(local);
    const central=new Uint8Array(46+n.length),cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true);cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);
    cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);
    central.set(n,46);centralParts.push(central);centralSize+=central.length;offset+=local.length;
  }
  const end=new Uint8Array(22),dv=new DataView(end.buffer);
  dv.setUint32(0,0x06054b50,true);dv.setUint16(8,centralParts.length,true);
  dv.setUint16(10,centralParts.length,true);dv.setUint32(12,centralSize,true);
  dv.setUint32(16,offset,true);
  return new Blob([...localParts,...centralParts,end],{type:mime});
}
function xlsx(rows,maquis){
  const inline=(ref,v,style=0)=>'<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t>'+xmlEscape(v)+'</t></is></c>';
  const numeric=(ref,v,style=2)=>'<c r="'+ref+'" s="'+style+'" t="n"><v>'+v+'</v></c>';
  const body=rows.map((r,i)=>{
    const line=i+6;
    return '<row r="'+line+'">'+numeric('A'+line,r.index,0)+inline('B'+line,r.name,0)
      +numeric('C'+line,r.buy)+numeric('D'+line,r.sell)+'</row>';
  }).join('');
  const header=['N°','Nom de la boisson',"Prix d'achat (F CFA)",'Prix de vente (F CFA)'];
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<dimension ref="A1:D'+Math.max(5,rows.length+5)+'"/>'
    +'<sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    +'<cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="40" customWidth="1"/><col min="3" max="4" width="27" customWidth="1"/></cols>'
    +'<sheetData>'
    +'<row r="1">'+inline('A1','MAQUISPRO — CATALOGUE DES BOISSONS',3)+'</row>'
    +'<row r="2">'+inline('A2','Établissement : '+maquis,3)+'</row>'
    +'<row r="3">'+inline('A3','Édité le : '+dateStamp(),0)+'</row>'
    +'<row r="5">'+header.map((v,i)=>inline('ABCD'[i]+'5',v,1)).join('')+'</row>'
    +body+'</sheetData>'
    +'<mergeCells count="2"><mergeCell ref="A1:D1"/><mergeCell ref="A2:D2"/></mergeCells>'
    +'<autoFilter ref="A5:D'+Math.max(5,rows.length+5)+'"/>'
    +'</worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +'<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/></font><font><b/><color rgb="FF08623F"/><sz val="14"/></font></fonts>'
    +'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF08623F"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    +'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>'
    +'<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    +'<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';
  return zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +'<sheets><sheet name="Boissons" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      +'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':styles,
    'xl/worksheets/sheet1.xml':sheet
  },'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function docx(rows,maquis){
  const run=(t,bold=false)=>'<w:r><w:rPr><w:color w:val="'+(bold?'064831':'263F35')+'"/><w:sz w:val="21"/>'+(bold?'<w:b/>':'')+'</w:rPr><w:t xml:space="preserve">'+xmlEscape(t)+'</w:t></w:r>';
  const para=(t,large=false)=>'<w:p><w:pPr><w:spacing w:after="180"/>'+(large?'<w:jc w:val="center"/>':'')+'</w:pPr>'
    +(large?'<w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="08623F"/></w:rPr><w:t>'+xmlEscape(t)+'</w:t></w:r>':run(t))+'</w:p>';
  const cell=(t,heading=false)=>'<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>'
    +(heading?'<w:shd w:fill="08623F"/>':'')+'</w:tcPr><w:p><w:pPr><w:spacing w:after="80"/></w:pPr>'
    +'<w:r><w:rPr>'+(heading?'<w:b/><w:color w:val="FFFFFF"/>':'')
    +'<w:sz w:val="19"/></w:rPr><w:t>'+xmlEscape(t)+'</w:t></w:r></w:p></w:tc>';
  const tr=(columns,heading=false)=>'<w:tr>'+(heading?'<w:trPr><w:tblHeader w:val="true"/></w:trPr>':'')
    +columns.map(c=>cell(c,heading)).join('')+'</w:tr>';
  const table='<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/>'
    +'<w:tblBorders><w:top w:val="single" w:sz="5"/><w:left w:val="single" w:sz="5"/>'
    +'<w:bottom w:val="single" w:sz="5"/><w:right w:val="single" w:sz="5"/>'
    +'<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>'
    +'</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="550"/><w:gridCol w:w="3750"/>'
    +'<w:gridCol w:w="2650"/><w:gridCol w:w="2650"/></w:tblGrid>'
    +tr(['N°','Nom de la boisson',"Prix d'achat (F CFA)",'Prix de vente (F CFA)'],true)
    +rows.map(p=>tr([String(p.index),p.name,digits(p.buy),digits(p.sell)])).join('')+'</w:tbl>';
  const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    +'<w:body>'+para('MAQUISPRO — CATALOGUE DES BOISSONS',true)
    +para('Établissement : '+maquis)+para('Édité le : '+dateStamp())
    +table+para('Document édité par MaquisPro • IGC — Impact Global Consulting')
    +'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="900" w:bottom="1134" w:left="900"/></w:sectPr></w:body></w:document>';
  return zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':document
  },'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
export function createCatalogueFile(products,maquis,format){
  const rows=normalizedProducts(products);
  if(rows.length===0)throw new Error("Ajoute d’abord une boisson au catalogue.");
  const name=String(maquis||'MaquisPro').trim().slice(0,120)||'MaquisPro';
  if(format==='xlsx')return xlsx(rows,name);
  if(format==='docx')return docx(rows,name);
  throw new Error("Format d’export invalide.");
}
export function exportCatalogue(products,maquis,format){
  const file=createCatalogueFile(products,maquis,format);
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;
  link.download='Catalogue_boissons_'+safeFilename(maquis)+'_'+dateStamp()+'.'+format;
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  return link.download;
}
