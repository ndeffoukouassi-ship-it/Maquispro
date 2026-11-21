import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import './style.css';

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const fmt=n=>new Intl.NumberFormat('fr-FR').format(n)+' F CFA';
const escapeHtml=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const conf={
  apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:import.meta.env.VITE_FIREBASE_APP_ID,
};
const configured=Object.values(conf).every(v=>typeof v==='string'&&v.length>3);
const backendReady=import.meta.env.VITE_MAQUISPRO_BACKEND_READY==='true';
const state={user:null,tenant:null,role:null,maquis:null,products:[],sales:[],expenses:[],cash:null,unsubs:[],functions:null,db:null,auth:null,stream:null,timer:null,pendingScanId:null,pendingBarcode:null};
function status(message,error=false){
  $('#status').textContent=message;
  $('#status').classList.toggle('error',error);
}
function errorMessage(e){
  const code=e?.code || 'unknown';
  if(code.includes('permission-denied'))return "Accès refusé : vérifie ton maquis et ton rôle.";
  if(code.includes('unauthenticated'))return "Connecte-toi avec ton compte personnel.";
  if(code.includes('not-found'))return e.message||"Boisson ou utilisateur introuvable.";
  if(code.includes('network-request-failed')||code.includes('unavailable'))return "Connexion réseau indisponible. Aucune vente confirmée.";
  if(code.includes('failed-precondition'))return e.message||"Maquis non actif ou stock insuffisant.";
  return e?.message||"Une erreur est survenue.";
}
function money(n){return fmt(Number.isFinite(n)?n:0);}
function onlyIds(s){return /^[a-zA-Z0-9_-]{1,90}$/.test(s);}
function epoch(t){return t?.toMillis?.()||0;}
function closeStreams(){
  state.unsubs.forEach(fn=>fn());state.unsubs=[];
  state.products=[];state.sales=[];state.expenses=[];state.cash=null;state.maquis=null;state.role=null;state.tenant=null;
  stopCamera();render();
}
function call(name,data){
  if(!backendReady)throw new Error("Le serveur Firebase sécurisé n’est pas encore activé. Aucun enregistrement de vente possible.");
  return httpsCallable(state.functions,name)(data).then(result=>result.data);
}
function render(){
  const p=state.products, sales=state.sales, expenses=state.expenses;
  $('#metricSales').textContent=sales.length;
  const revenue=sales.reduce((n,x)=>n+(x.prixVenteUnitaire||0),0);
  const cost=sales.reduce((n,x)=>n+(x.coutAchatUnitaire||0),0);
  const charge=expenses.reduce((n,x)=>n+(x.montant||0),0);
  $('#metricRevenue').textContent=money(revenue);
  $('#metricMargin').textContent=money(revenue-cost);
  $('#metricStock').textContent=p.reduce((n,x)=>n+(x.stockActuel||0),0);
  $('#reportRevenue').textContent=money(revenue);
  $('#reportCost').textContent=money(cost);
  $('#reportGross').textContent=money(revenue-cost);
  $('#reportExpenses').textContent=money(charge);
  $('#reportNet').textContent=money(revenue-cost-charge);
  $('#cashToday').textContent=money(state.cash?.totalVentesDeclarees||0);
  $('#cashNote').textContent="Espèces déclarées : "+money(state.cash?.totalEspecesDeclarees||0)+
    " · Paiements mobiles non vérifiés : "+money(state.cash?.totalNumeriqueNonVerifie||0);
  $('#maquisName').textContent=state.maquis?.nom||'Votre maquis';
  $('#roleName').textContent=state.role ? "Espace "+(state.role==='serveur'?'Serveur':state.role==='gerant'?'Gérant':'Propriétaire') : 'Espace MaquisPro';
  $('#licenceStatus').textContent=state.maquis?.statut==='actif'
    ? "Licence active · "+(state.maquis?.ville||'Côte d’Ivoire')
    : "Licence en attente : opérations bloquées.";
  $('#stockRows').innerHTML=p.length ? p.map(x=>'<tr><td>'+escapeHtml(x.nom)+'</td><td>'+money(x.prixAchat)+'</td><td>'+money(x.prixVente)+'</td><td><b>'+x.stockActuel+'</b></td><td>'+escapeHtml(x.codeBarres||'À renseigner')+'</td></tr>').join('')
    : '<tr><td colspan="5">Aucune boisson enregistrée pour cet établissement.</td></tr>';
  $('#stockSelect').innerHTML=p.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.nom)+'</option>').join('');
  $('#inventoryFields').innerHTML=p.map(x=>
    '<label class="inventory-item">'+escapeHtml(x.nom)+' (stock théorique '+x.stockActuel+')'+
    '<input type="number" min="0" step="1" name="'+escapeHtml(x.id)+'" placeholder="Quantité"></label>').join('');
  $('#salesList').innerHTML=sales.length ? sales.slice(0,40).map(x=>'<p><b>'+escapeHtml(x.nomBoisson)+'</b> — '+money(x.prixVenteUnitaire)+
    ' <small>('+new Date(epoch(x.dateVente)).toLocaleString('fr-FR',{timeZone:'Africa/Abidjan'})+
    ')</small></p>').join('') : '<p>Aucune vente pour le moment.</p>';
}
function showPage(name){
  const role=state.role;
  if(role==='serveur' && !['scan','stock','rapports'].includes(name)) {
    status("Cette rubrique est réservée au gérant.",true);return;
  }
  $$('.page').forEach(p=>p.hidden=p.id!=='page-'+name);
  if(name!=='scan')stopCamera();
}
function listen(pathOrQuery,cb){
  const unsub=onSnapshot(pathOrQuery,cb,e=>status(errorMessage(e),true));
  state.unsubs.push(unsub);
}
async function enterMaquis(uid,maquisId){
  closeStreams();
  if(!onlyIds(maquisId)){status('Identifiant du maquis invalide.',true);return;}
  state.tenant=maquisId;
  const membership=doc(state.db,'maquis',maquisId,'membres',uid);
  // Le document d'appartenance ne peut être lu que par son bénéficiaire.
  const {getDoc}=await import('firebase/firestore');
  const snapshot=await getDoc(membership);
  if(!snapshot.exists()||snapshot.data().actif!==true)throw new Error('Ce compte n’est pas autorisé dans ce maquis.');
  state.role=snapshot.data().role;
  $('#authPanel').hidden=true;$('#appPanel').hidden=false;
  $('#logout').hidden=false;$('#connection').textContent='Connecté à Firebase';
  if(state.role==='serveur'){
    $('#stockManager').hidden=true;
    $('#expenseManager').hidden=true;
    $('#teamForm').hidden=true;
    $('#inventoryForm').hidden=true;
    $$('.actions button').filter(b=>!['scan','stock','rapports'].includes(b.dataset.page)).forEach(b=>b.hidden=true);
  }else{
    $('#stockManager').hidden=false;$('#expenseManager').hidden=false;
    $('#inventoryForm').hidden=false;
    $$('.actions button').forEach(b=>b.hidden=false);
    $('#teamForm').hidden=state.role!=='proprietaire';
  }
  listen(doc(state.db,'maquis',maquisId),snap=>{
    if(!snap.exists()){status("Maquis introuvable.",true);return;}
    state.maquis=snap.data();
    status(state.maquis.statut==='actif'
      ? "Connexion établie : données de "+state.maquis.nom+" synchronisées."
      : "Maquis non activé : demande l'activation à IGC.",
      state.maquis.statut!=='actif');
    render();
  });
  listen(collection(state.db,'maquis',maquisId,'boissons'),snap=>{
    state.products=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    render();
  });
  const salesRef=collection(state.db,'maquis',maquisId,'ventes');
  const salesQuery=state.role==='serveur'?query(salesRef,where('serveurUid','==',uid)):salesRef;
  listen(salesQuery,snap=>{
    state.sales=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>epoch(b.dateVente)-epoch(a.dateVente));
    render();
  });
  if(state.role!=='serveur'){
    const date=new Date().toISOString().slice(0,10);
    listen(doc(state.db,'maquis',maquisId,'caisse',date),snap=>{state.cash=snap.exists()?snap.data():null;render();});
    listen(collection(state.db,'maquis',maquisId,'depenses'),snap=>{state.expenses=snap.docs.map(d=>d.data());render();});
  }
  showPage('scan');render();
}
async function submitSale(code){
  if(!state.user||!state.tenant)throw Error("Non connecté à un maquis.");
  code=String(code||'').trim();
  if(!/^[0-9]{8,14}$/.test(code))throw Error("Saisis un code-barres de 8 à 14 chiffres.");
  const method=$('#paymentMethod').value;
  // Reprendre le même ID uniquement pour une éventuelle retransmission du même scan.
  if(state.pendingBarcode!==code){
    state.pendingScanId=crypto.randomUUID().replaceAll('-','');
    state.pendingBarcode=code;
  }
  const receipt=await call('saleScan',{maquisId:state.tenant,
    codeBarres:code,modePaiement:method,scanOperationId:state.pendingScanId});
  state.pendingScanId=null;state.pendingBarcode=null;
  $('#scanMessage').textContent=(receipt.duplicata?'Reçu déjà enregistré':'VENTE ENREGISTRÉE')+
    ' : '+receipt.boisson+' • '+money(receipt.prix)+' • stock restant '+(receipt.stockRestant??'—');
  $('#scanMessage').classList.remove('bad');
  status("Scan confirmé par Firebase. Caisse et stock actualisés.");
}
async function stopCamera(){
  if(state.timer){clearInterval(state.timer);state.timer=null;}
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
  const el=$('#video');el.srcObject=null;el.hidden=true;$('#stopCamera').hidden=true;
  state.cameraBusy=false;
}
async function startCamera(){
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)throw Error("Caméra non compatible. Utilise la saisie manuelle.");
  await stopCamera();
  const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
  state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  $('#video').hidden=false;$('#video').srcObject=state.stream;await $('#video').play();
  $('#stopCamera').hidden=false;
  state.cameraBusy=false;
  state.timer=setInterval(async()=>{
    if(state.cameraBusy||!state.stream||$('#video').readyState<2)return;
    state.cameraBusy=true;
    try{
      const codes=await detector.detect($('#video'));
      if(codes[0]?.rawValue){
        const code=codes[0].rawValue;
        await stopCamera();
        try{await submitSale(code);}
        catch(e){$('#scanMessage').textContent=errorMessage(e);$('#scanMessage').classList.add('bad');status(errorMessage(e),true);}
      }
    }catch(e){status(errorMessage(e),true);}
    finally{state.cameraBusy=false;}
  },600);
}
function bind(){
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const f=e.currentTarget;
    const maquisId=f.elements.tenant.value.trim();
    try{
      sessionStorage.setItem('maquisId',maquisId);
      await signInWithEmailAndPassword(state.auth,f.elements.email.value.trim(),f.elements.password.value);
    }catch(error){status(errorMessage(error),true);}
  });
  $('#signup').addEventListener('click',async()=>{
    const f=$('#loginForm');
    try{
      await createUserWithEmailAndPassword(state.auth,f.elements.email.value.trim(),f.elements.password.value);
      status("Compte créé. Le propriétaire doit maintenant vous autoriser dans le maquis.");
    }catch(e){status(errorMessage(e),true);}
  });
  $('#logout').onclick=async()=>{await signOut(state.auth);closeStreams();$('#appPanel').hidden=true;$('#adminPanel').hidden=true;$('#authPanel').hidden=false;$('#logout').hidden=true;status('Déconnecté.');};
  $$('.actions button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  $('#saleForm').onsubmit=async e=>{
    e.preventDefault();
    try{await submitSale($('#barcode').value);}
    catch(error){$('#scanMessage').textContent=errorMessage(error);$('#scanMessage').classList.add('bad');status(errorMessage(error),true);}
  };
  $('#startCamera').onclick=async()=>{try{await startCamera();}catch(error){status(errorMessage(error),true);}};
  $('#stopCamera').onclick=stopCamera;
  $('#addDrinkForm').onsubmit=async e=>{
    e.preventDefault();
    const f=e.currentTarget;
    try{
      await call('addDrink',{maquisId:state.tenant,nom:f.elements.nom.value,
        codeBarres:f.elements.codeBarres.value||null,
        prixAchat:Number(f.elements.prixAchat.value),prixVente:Number(f.elements.prixVente.value)});
      f.reset();status('Boisson créée dans Firebase. Ajoute ensuite le stock.');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#stockForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget;
    try{await call('stockIn',{maquisId:state.tenant,boissonId:f.elements.boissonId.value,
        quantite:Number(f.elements.quantite.value),coutUnitaire:Number(f.elements.coutUnitaire.value)});
      f.reset();status('Approvisionnement synchronisé sur tous les téléphones.');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#expenseForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget;
    try{await call('recordExpense',{maquisId:state.tenant,libelle:f.elements.libelle.value,montant:Number(f.elements.montant.value)});
      f.reset();status('Dépense enregistrée.');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#inventoryForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,values=new FormData(f),comptages={};
    for(const p of state.products){
      const raw=values.get(p.id);
      if(raw!==null && raw!=='')comptages[p.id]=Number(raw);
    }
    try{await call('recordInventory',{maquisId:state.tenant,periodeType:values.get('periodeType'),comptages});
      status('Comptage enregistré dans Firebase, sans modifier les stocks.');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#teamForm').onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget;
    try{await call('addMember',{maquisId:state.tenant,email:f.elements.email.value,role:f.elements.role.value});
      f.reset();status('Compte autorisé sur ce maquis.');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#createMaquisForm').onsubmit=async e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);
    try{const result=await call('createMaquis',Object.fromEntries(data));
      status('Nouveau maquis créé : '+result.maquisId+' (en attente d’activation).');
    }catch(error){status(errorMessage(error),true);}
  };
  $('#activateForm').onsubmit=async e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);
    try{const result=await call('activateMaquis',Object.fromEntries(data));
      status('Maquis activé : '+result.maquisId);
    }catch(error){status(errorMessage(error),true);}
  };
}
async function start(){
  bind();
  if(!configured){
    $('#configWarning').hidden=false;
    status("Configuration Firebase manquante. Ajouter VITE_FIREBASE_* dans Render pour activer cette version.",true);
    return;
  }
  if(!backendReady){
    const message="Firebase Web est configuré, mais les fonctions de vente ne sont pas encore déployées. N’enregistre aucune recette réelle sur ce pilote.";
    $('#configWarning').hidden=false;
    $('#configWarning').textContent=message;
    status("Connexion Firebase Web préparée. Activation des opérations en attente.",true);
    ['saleForm','addDrinkForm','stockForm','expenseForm','inventoryForm','teamForm','createMaquisForm','activateForm'].forEach(id=>{
      const form=document.getElementById(id);
      if(form)form.querySelectorAll('button[type=submit],button:not([type])').forEach(btn=>{btn.disabled=true;btn.title="Fonctions serveur non déployées";});
    });
    $('#startCamera').disabled=true;
  }
  const app=initializeApp(conf);
  state.auth=getAuth(app);state.db=getFirestore(app);state.functions=getFunctions(app,'europe-west1');
  onAuthStateChanged(state.auth,async user=>{
    state.user=user;
    if(!user){
      closeStreams();$('#authPanel').hidden=false;$('#appPanel').hidden=true;$('#adminPanel').hidden=true;$('#logout').hidden=true;
      status(backendReady?'Connexion nécessaire.':'Configuration Web en place ; serveur de ventes non activé.');
      return;
    }
    const token=await getIdTokenResult(user);
    $('#adminPanel').hidden=token.claims.platformAdmin!==true;
    const maquisId=sessionStorage.getItem('maquisId')||$('#tenantId').value.trim();
    if(maquisId){
      try{await enterMaquis(user.uid,maquisId);}
      catch(e){status(errorMessage(e),true);$('#authPanel').hidden=false;}
    }else{status('Authentifié. Saisissez le code de votre maquis.');}
  });
}
start();
