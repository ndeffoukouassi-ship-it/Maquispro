"use strict";
// MaquisPro web: DEMONSTRATION LOCALE UNIQUEMENT - pas de Firebase/paiement réel.
const KEY="maquispro-demo-render-2026";
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const money=n=>new Intl.NumberFormat("fr-FR").format(n)+" F";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():"id"+Date.now()+Math.random().toString(16).slice(2);
const num=v=>v!==null&&String(v).trim()!==""&&Number.isSafeInteger(Number(v))?Number(v):NaN;
const ok=n=>Number.isSafeInteger(n)&&n>=0;
const localDate=ts=>new Date(ts).toLocaleString("fr-FR",{timeZone:"Africa/Abidjan",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
function seed(){return {profile:{name:"",manager:"",city:"",configuredAt:null},
 products:[{id:"castel65",name:"Castel 65 cl",buy:550,sell:650,stock:24,barcode:""}],
 sales:[],movements:[],expenses:[],inventories:[],lastCashCount:null};}
let state;
try{const saved=localStorage.getItem(KEY);state=saved?JSON.parse(saved):seed();if(!Array.isArray(state.products)||!Array.isArray(state.sales)||!Array.isArray(state.movements)||!Array.isArray(state.inventories))throw Error("données invalides");}catch{state=seed();}
let cameraStream=null, cameraTimer=null, cameraBusy=false, toastTimer=null;
function store(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast("Données non sauvegardées: stockage indisponible.",true);}}
function toast(t,bad=false){const a=$("#toast");a.textContent=t;a.style.background=bad?"#a52b2b":"#064431";a.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>a.classList.remove("visible"),3600);}
function empty(s="Aucune opération."){return '<p class="empty">'+esc(s)+'</p>';}
function totals(){let revenue=0,cost=0,expenses=0;state.sales.forEach(x=>{revenue+=x.sell;cost+=x.buy;});state.expenses.forEach(x=>expenses+=x.amount);return {revenue,cost,expenses,gross:revenue-cost,net:revenue-cost-expenses};}
function view(name){const target=$("#view-"+name);if(!target)return;if(name!=="scan")stopCamera();$$(".panel").forEach(p=>p.hidden=p!==target);$$(".nav-btn").forEach(p=>p.classList.toggle("selected",p.dataset.view===name));render();target.scrollIntoView({behavior:"smooth",block:"start"});}
function render(){
 const t=totals();
 $("#heroMaquis").textContent=state.profile.name||"Votre maquis";
 $("#configured").textContent=state.profile.configuredAt?"Fiche configurée le "+state.profile.configuredAt.slice(0,10)+" · "+(state.profile.city||"localité libre"):"Personnalisez ce maquis dans Profil";
 $("#metricRevenue").textContent=money(t.revenue);
 $("#metricSales").textContent=state.sales.length;
 $("#metricStock").textContent=state.products.reduce((s,p)=>s+p.stock,0);
 const low=state.products.filter(p=>p.stock<=5);
 $("#metricAlerts").textContent=low.length?low.length+" alerte(s) stock":"aucune alerte";
 $("#metricProfit").textContent=money(t.gross);
 $("#reportRevenue").textContent=money(t.revenue);$("#reportCost").textContent=money(t.cost);$("#reportExpenses").textContent=money(t.expenses);$("#reportNet").textContent=money(t.net);
 $("#cashExpected").textContent=money(t.revenue);
 $("#expensesTotal").textContent="Dépenses de démonstration: "+money(t.expenses);
 $("#cashDifference").textContent=state.lastCashCount===null?"Espèces comptées non renseignées.":"Argent compté: "+money(state.lastCashCount)+" · Écart: "+money(state.lastCashCount-t.revenue);
 $("#cashDifference").classList.toggle("error",state.lastCashCount!==null&&state.lastCashCount!==t.revenue);
 $("#recentSales").innerHTML=state.sales.length?state.sales.slice(-5).reverse().map(s=>'<div class="rowline"><span>'+esc(s.name)+'<br><small>'+localDate(s.ts)+'</small></span><b>'+money(s.sell)+'</b></div>').join(""):empty("Pas encore de vente dans ce navigateur.");
 $("#lowStock").innerHTML=low.length?low.map(p=>'<div class="rowline"><span>'+esc(p.name)+'</span><b>'+p.stock+' restante(s)</b></div>').join(""):empty("Pas d'alerte de stock.");
 $("#stockTable").innerHTML='<table><thead><tr><th>Boisson</th><th>Code-barres</th><th>Achat</th><th>Vente</th><th>Stock</th><th>Marge</th></tr></thead><tbody>'+state.products.map(p=>'<tr><td><b>'+esc(p.name)+'</b></td><td>'+(p.barcode?esc(p.barcode):"à vérifier")+'</td><td>'+money(p.buy)+'</td><td>'+money(p.sell)+'</td><td>'+p.stock+'</td><td>'+money(p.sell-p.buy)+'</td></tr>').join("")+'</tbody></table>';
 $("#restockProduct").innerHTML=state.products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
 $("#quickSale").innerHTML=state.products.map(p=>'<div class="rowline"><span>'+esc(p.name)+'<br><small>'+money(p.sell)+' · '+p.stock+' disponible(s)</small></span><button class="gold-button test-sale" data-id="'+esc(p.id)+'" '+(p.stock===0?"disabled":"")+'>Vente test</button></div>').join("");
 $("#salesTable").innerHTML=state.sales.length?'<table><thead><tr><th>Date Abidjan</th><th>Boisson</th><th>Serveur</th><th>Recette</th><th>Bénéfice brut</th></tr></thead><tbody>'+state.sales.slice().reverse().map(s=>'<tr><td>'+localDate(s.ts)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.server)+'</td><td>'+money(s.sell)+'</td><td>'+money(s.sell-s.buy)+'</td></tr>').join("")+'</tbody></table>':empty();
 const ranking=state.products.map(p=>({id:p.id,name:p.name,profit:state.sales.filter(s=>s.pid===p.id).reduce((n,s)=>n+s.sell-s.buy,0)})).filter(p=>p.profit!==0).sort((a,b)=>b.profit-a.profit);
 const max=Math.max(1,...ranking.map(p=>Math.max(0,p.profit)));
 $("#profitRanking").innerHTML=ranking.length?ranking.map((p,i)=>'<div class="rank-line"><strong>'+(i+1)+'. '+esc(p.name)+'</strong><div class="track"><div class="bar" style="width:'+Math.max(0,100*p.profit/max)+'%"></div></div><b>'+money(p.profit)+'</b></div>').join(""):empty("Aucune vente pour établir le classement.");
 renderInventory();
 const form=$("#profileForm");form.elements.name.value=state.profile.name;form.elements.manager.value=state.profile.manager;form.elements.city.value=state.profile.city;
 $("#profileMeta").textContent=state.profile.configuredAt?"Configuration locale: "+localDate(state.profile.configuredAt)+" · Licence IGC non activée.":"Licence IGC non activée. Démonstration non synchronisée.";
}
function period(){
 const d=new Date(),today=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),type=$("#period").value;
 let start=today;
 if(type==="semaine")start-=((d.getUTCDay()+6)%7)*86400000;
 if(type==="mois")start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);
 return {start:new Date(start).toISOString(),type,label:type==="jour"?"Aujourd'hui":type==="semaine"?"Cette semaine":"Ce mois"};
}
function inventoryRows(){
 const p=period();
 return state.products.map(prod=>{
 const changes=state.movements.filter(m=>m.pid===prod.id&&m.ts>=p.start);
 const entries=changes.filter(x=>x.kind==="entree").reduce((sum,x)=>sum+x.qty,0);
 const sold=state.sales.filter(x=>x.pid===prod.id&&x.ts>=p.start).length;
 const last=state.inventories.filter(x=>x.period===p.type&&x.start===p.start).slice(-1)[0];
 const counted=last?.counts?.[prod.id];
 return {prod,entries,sold,opening:prod.stock-entries+sold,expected:prod.stock,counted};
 });
}
function renderInventory(){
 const p=period();$("#periodLabel").textContent=p.label+" · "+p.start.slice(0,10);
 const rows=inventoryRows();
 $("#inventoryTable").innerHTML='<table><thead><tr><th>Boisson</th><th>Ouverture*</th><th>Entrées</th><th>Ventes</th><th>Théorique</th><th>Compté</th><th>Écart</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><b>'+esc(x.prod.name)+'</b></td><td>'+x.opening+'</td><td>+'+x.entries+'</td><td>-'+x.sold+'</td><td>'+x.expected+'</td><td><input class="physical-count" data-id="'+esc(x.prod.id)+'" type="number" min="0" step="1" placeholder="Compter" value="'+(x.counted??"")+'"></td><td class="difference" data-id="'+esc(x.prod.id)+'">'+(x.counted===undefined?"—":x.counted-x.expected)+'</td></tr>').join("")+'</tbody></table>';
 const last=state.inventories.filter(x=>x.period===p.type&&x.start===p.start).slice(-1)[0];
 $("#inventorySaved").textContent=last?"Comptage du "+localDate(last.ts):"*Ouverture théorique estimée sur cette période.";
}
function saveSale(p,test=false){
 if(!p||p.stock<=0){toast("Rupture de stock: aucune vente.",true);return false;}
 const s={id:uid(),pid:p.id,name:p.name,buy:p.buy,sell:p.sell,server:"Serveur de test",ts:now()};
 p.stock--;state.sales.push(s);state.movements.push({id:uid(),pid:p.id,kind:"vente",qty:-1,ts:s.ts,ref:s.id});
 store();render();
 const message=(test?"VENTE TEST":"SCAN CONFIRMÉ")+" · "+p.name+" · "+money(p.sell)+" · Stock -1 · Marge "+money(p.sell-p.buy);
 $("#scanResult").textContent=message;$("#scanResult").classList.remove("error");toast(message);return true;
}
function scanBarcode(barcode){
 const code=String(barcode||"").trim();
 if(!code){toast("Entre un code-barres.",true);return false;}
 const p=state.products.find(p=>p.barcode&&p.barcode===code);
 if(!p){$("#scanResult").textContent="Code-barres inconnu: aucune vente. Enregistre d'abord la référence vérifiée dans Stock.";$("#scanResult").classList.add("error");toast("Code inconnu: vente refusée.",true);return false;}
 return saveSale(p);
}
function stopCamera(){
 if(cameraTimer){clearInterval(cameraTimer);cameraTimer=null;}
 if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
 const video=$("#camera");video.srcObject=null;video.hidden=true;cameraBusy=false;
 $("#stopCamera").hidden=true;$("#startCamera").disabled=false;
}
async function startCamera(){
 if(!("BarcodeDetector" in window)||!navigator.mediaDevices?.getUserMedia){
  $("#cameraStatus").textContent="Scan caméra non pris en charge ici. Utilise Chrome sous HTTPS ou le champ manuel.";toast("Caméra non compatible.",true);return;
 }
 try{
 const detector=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e","code_128"]});
 cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
 const video=$("#camera");video.hidden=false;video.srcObject=cameraStream;await video.play();
 $("#cameraStatus").textContent="Présente une seule bouteille devant la caméra.";
 $("#stopCamera").hidden=false;$("#startCamera").disabled=true;
 cameraTimer=setInterval(async()=>{
   if(!cameraStream||cameraBusy||video.readyState<2)return;
   cameraBusy=true;
   try{
     const matches=await detector.detect(video),code=matches[0]?.rawValue;
     if(code){stopCamera();const success=scanBarcode(code);$("#cameraStatus").textContent=success?"Vente enregistrée. Rouvre la caméra pour une autre bouteille.":"Code inconnu, aucune vente.";}
   }catch{ $("#cameraStatus").textContent="Lecture difficile. Améliore l'éclairage."; }
   finally{cameraBusy=false;}
 },650);
 }catch{stopCamera();$("#cameraStatus").textContent="Autorisation caméra refusée ou matériel indisponible.";toast("Caméra non accessible.",true);}
}
$("[data-view]").forEach(b=>b.addEventListener("click",()=>view(b.dataset.view)));
$(".period-shortcut").forEach(button=>button.addEventListener("click",()=>{
  const period=button.dataset.period;
  if(!["jour","semaine","mois"].includes(period))return;
  $("#period").value=period;
  view("inventaire");
  renderInventory();
}));
$("#settingsBtn").onclick=()=>view("parametres");$("#menuBtn").onclick=()=>view("accueil");
$("#period").onchange=renderInventory;
// Exports natifs XLSX et DOCX du catalogue local (aucun transfert de données).
async function downloadCatalogue(format){
 try{
   const {exportCatalogue}=await import("./catalog-export.mjs");
   const file=exportCatalogue(state.products.map(p=>({name:p.name,buy:p.buy,sell:p.sell})),state.profile?.name||"MaquisPro",format);
   toast("Fichier créé : "+file);
 }catch(e){toast("Export impossible : "+(e.message||e),true);}
}
$("#exportExcel").onclick=()=>downloadCatalogue("xlsx");
$("#exportWord").onclick=()=>downloadCatalogue("docx");
$("#inventoryTable").addEventListener("input",e=>{
 if(!e.target.classList.contains("physical-count"))return;
 const id=e.target.dataset.id,x=inventoryRows().find(p=>p.prod.id===id);
 const cell=$$(".difference").find(c=>c.dataset.id===id);
 if(!cell||!x)return;
 const v=e.target.value.trim()===""?null:num(e.target.value);
 cell.textContent=v===null?"—":ok(v)?v-x.expected:"Valeur invalide";
});
$("#saveInventory").onclick=()=>{
 const counts={};
 for(const input of $$(".physical-count")){
 if(input.value.trim()==="")continue;
 const n=num(input.value);if(!ok(n)){toast("Comptage invalide.",true);return;}
 counts[input.dataset.id]=n;
 }
 if(!Object.keys(counts).length){toast("Saisis au moins un stock physique.",true);return;}
 const p=period();state.inventories.push({id:uid(),period:p.type,start:p.start,counts,ts:now()});
 store();renderInventory();toast("Comptage enregistré: aucun ajustement de stock automatique.");
};
$("#newProduct").onsubmit=e=>{
 e.preventDefault();const d=new FormData(e.target);
 const name=String(d.get("name")||"").trim(),barcode=String(d.get("barcode")||"").trim(),buy=num(d.get("buy")),sell=num(d.get("sell")),qty=num(d.get("qty"));
 if(!name||!ok(buy)||!(sell>0&&ok(sell))||!ok(qty)){toast("Saisie invalide.",true);return;}
 if(barcode&&state.products.some(p=>p.barcode===barcode)){toast("Code-barres déjà enregistré.",true);return;}
 state.products.push({id:uid(),name,barcode,buy,sell,stock:qty});store();e.target.reset();render();toast("Boisson ajoutée au catalogue de test.");
};
$("#restockForm").onsubmit=e=>{
 e.preventDefault();const d=new FormData(e.target),p=state.products.find(p=>p.id===d.get("productId")),qty=num(d.get("quantity")),cost=num(d.get("cost"));
 if(!p||!(qty>0&&ok(qty))||!ok(cost)){toast("Approvisionnement invalide.",true);return;}
 p.stock+=qty;p.buy=cost;state.movements.push({id:uid(),pid:p.id,kind:"entree",qty,unitCost:cost,ts:now()});
 store();render();toast(qty+" bouteilles ajoutées: "+p.name);
};
$("#quickSale").onclick=e=>{const b=e.target.closest(".test-sale");if(b)saveSale(state.products.find(p=>p.id===b.dataset.id),true);};
$("#barcodeSale").onclick=()=>scanBarcode($("#barcodeInput").value);
$("#barcodeInput").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();scanBarcode(e.target.value);}};
$("#startCamera").onclick=startCamera;$("#stopCamera").onclick=stopCamera;
$("#cashForm").onsubmit=e=>{
 e.preventDefault();const v=num(new FormData(e.target).get("actual"));if(!ok(v)){toast("Montant invalide.",true);return;}
 state.lastCashCount=v;store();render();toast("Rapprochement de caisse calculé.");
};
$("#expenseForm").onsubmit=e=>{
 e.preventDefault();const d=new FormData(e.target),label=String(d.get("label")||"").trim(),amount=num(d.get("amount"));
 if(!label||!ok(amount)){toast("Dépense invalide.",true);return;}
 state.expenses.push({id:uid(),label,amount,ts:now()});store();e.target.reset();render();toast("Dépense de test enregistrée.");
};
$("#profileForm").onsubmit=e=>{
 e.preventDefault();const d=new FormData(e.target),name=String(d.get("name")||"").trim();
 if(!name){toast("Indique un nom de maquis.",true);return;}
 state.profile={name,manager:String(d.get("manager")||"").trim(),city:String(d.get("city")||"").trim(),configuredAt:state.profile.configuredAt||now()};
 store();render();toast("Fiche du maquis enregistrée localement.");
};
$("#resetDemo").onclick=()=>{
 if(!confirm("Effacer toutes les données de démonstration de ce navigateur ?"))return;
 stopCamera();state=seed();store();render();toast("Démonstration réinitialisée.");
};
render();


// MaquisPro : installation PWA de démonstration.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  const button = document.querySelector("#installBtn");
  if (button) button.hidden = false;
});
document.querySelector("#installBtn")?.addEventListener("click", async () => {
  if (!installPrompt) {
    toast("Sur Android : Chrome ⋮ → Ajouter à l'écran d'accueil.", false);
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.querySelector("#installBtn").hidden = true;
});
window.addEventListener("appinstalled", () => {
  document.querySelector("#installBtn").hidden = true;
  toast("MaquisPro installé en mode démonstration.");
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // L'application reste accessible en ligne si le cache n'est pas pris en charge.
    });
  });
}
