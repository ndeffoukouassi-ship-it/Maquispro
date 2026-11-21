import { createClient } from '@supabase/supabase-js';
import { exportCatalogue } from './catalog-export.js';
import './style.css';

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const money=n=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)||0)+' F CFA';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeNum=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const uuidRE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const url=import.meta.env.VITE_SUPABASE_URL||'';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)&&key.length>20;
const backendReady=import.meta.env.VITE_MAQUISPRO_BACKEND_READY==='true';
const client=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

const state={
  user:null,role:null,maquis:null,tenant:null,admin:false,products:[],sales:[],
  stats:{},refreshing:false,generation:0,channel:null,refreshTimer:null,
  stream:null,scanTimer:null,scanning:false,pendingId:null,pendingCode:null
};
function status(message,bad=false){
  $('#status').textContent=message;
  $('#status').classList.toggle('error',bad);
}
function errorText(e){
  if(e?.message?.includes('JWT'))return 'Session expirée. Reconnecte-toi.';
  if(e?.message?.includes('permission')||e?.code==='42501')return 'Accès refusé à ce maquis.';
  if(e?.message?.includes('fetch')||e?.message?.includes('network'))return 'Réseau indisponible : aucune vente confirmée.';
  return (e?.message||String(e)||'Une erreur est survenue').slice(0,230);
}
function assertOnline(){
  if(!client||!configured)throw Error('Projet Supabase non configuré.');
  if(!backendReady)throw Error('Serveur Supabase non déployé : aucune vente réelle activée.');
}
async function rpc(name,args={}){
  assertOnline();
  const {data,error}=await client.rpc(name,args);
  if(error)throw error;
  return data;
}
function resetUI(){
  state.generation++;
  if(state.refreshTimer){clearInterval(state.refreshTimer);state.refreshTimer=null;}
  if(state.channel&&client){client.removeChannel(state.channel);state.channel=null;}
  void stopCamera();
  state.role=null;state.tenant=null;state.maquis=null;
  state.products=[];state.sales=[];state.stats={};state.pendingId=null;state.pendingCode=null;
  $('#appPanel').hidden=true;
  $('#appPanel').dataset.role='';
  $('#connection').textContent='Non connecté à un maquis';
}
function nameRole(role){
  return role==='proprietaire'?'Propriétaire':role==='gerant'?'Gérant':'Serveur';
}
function showPage(page){
  if(state.role==='serveur'&&!['scan','stock'].includes(page)){
    status('Cette rubrique est réservée au gérant.',true);return;
  }
  $$('.page').forEach(x=>x.hidden=x.id!=='page-'+page);
  if(page!=='scan')void stopCamera();
}
function render(){
  const s=state.stats,p=state.products;
  $('#maquisName').textContent=state.maquis?.nom||'Votre maquis';
  $('#roleName').textContent='Espace '+nameRole(state.role);
  $('#licenceStatus').textContent=state.maquis
    ?'Statut : '+state.maquis.statut+' · '+(state.maquis.ville||'')+
       (state.maquis.expire_le?' · expire le '+new Date(state.maquis.expire_le).toLocaleDateString('fr-FR'):'')
    :'Licence en attente';
  $('#metricSales').textContent=s.nombreVentes??0;
  $('#metricRevenue').textContent=money(s.recettes);
  $('#metricMargin').textContent=state.role==='serveur'?'—':money(s.beneficeBrut);
  $('#metricStock').textContent=s.stock??p.reduce((a,x)=>a+(Number(x.stock)||0),0);
  $('#cashToday').textContent=money(s.caisse);
  $('#cashNote').textContent='Paiements mobiles non vérifiés : '+money(s.mobileNonVerifie)+'. Pas de confirmation Wave/Orange/MTN automatique.';
  $('#reportRevenue').textContent=money(s.recettes);
  $('#reportCost').textContent=money((s.recettes||0)-(s.beneficeBrut||0));
  $('#reportGross').textContent=money(s.beneficeBrut);
  $('#reportExpenses').textContent=money(s.depenses);
  $('#reportNet').textContent=money(s.beneficeNetEstime);
  $('#stockRows').innerHTML=p.length?p.map(x=>
    '<tr><td>'+esc(x.nom)+'</td><td class="manager-price">'+(state.role==='serveur'?'—':money(x.prix_achat))+
    '</td><td>'+money(x.prix_vente)+'</td><td><strong>'+safeNum(x.stock)+'</strong></td><td>'+
    esc(x.code_barres||'Non renseigné')+'</td></tr>').join('')
    :'<tr><td colspan="5">Aucune boisson enregistrée pour cet établissement.</td></tr>';
  $('#stockSelect').innerHTML=p.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nom)+'</option>').join('');
  $('#inventoryFields').innerHTML=p.map(x=>'<label class="inventory-item">'+esc(x.nom)+' (théorique : '+safeNum(x.stock)+')'+
    '<input type="number" name="'+esc(x.id)+'" min="0" max="999999999" step="1" placeholder="Quantité comptée"></label>').join('');
  $('#salesList').innerHTML=state.sales.length
    ?state.sales.map(x=>'<p><strong>'+esc(x.nom_boisson)+'</strong> — '+money(x.prix_vente)+
      ' <small>'+new Date(x.cree_le).toLocaleString('fr-FR',{timeZone:'Africa/Abidjan'})+'</small></p>').join('')
    :'<p>Aucune vente récente.</p>';
}
async function refresh(){
  if(!client||!state.user||!state.tenant||state.refreshing)return;
  const gen=state.generation;state.refreshing=true;
  try{
    const tenant=state.tenant,isServer=state.role==='serveur';
    const [maquis,drinks,summary,sales]=await Promise.all([
      client.from('mp_maquis').select('id,nom,ville,statut,expire_le').eq('id',tenant).single(),
      isServer?client.rpc('mp_catalogue_serveur',{p_maquis:tenant}):
        client.from('mp_boissons').select('id,nom,prix_achat,prix_vente,stock,code_barres,actif').eq('maquis_id',tenant).order('nom'),
      client.rpc('mp_tableau_de_bord',{p_maquis:tenant}),
      isServer?client.rpc('mp_mes_ventes',{p_maquis:tenant}):
        client.from('mp_ventes').select('operation_id,nom_boisson,prix_vente,cree_le').eq('maquis_id',tenant).order('cree_le',{ascending:false}).limit(60)
    ]);
    for(const r of [maquis,drinks,summary,sales])if(r.error)throw r.error;
    if(gen!==state.generation)return;
    state.maquis=maquis.data;
    state.products=(drinks.data||[]).filter(x=>x.actif!==false);
    state.stats=summary.data||{};
    state.sales=sales.data||[];
    render();
  }catch(e){if(gen===state.generation)status(errorText(e),true);}
  finally{state.refreshing=false;}
}
async function enterTenant(maquisId){
  if(!uuidRE.test(maquisId))throw Error('Identifiant du maquis invalide (UUID).');
  if(!state.user)throw Error('Compte non connecté.');
  const {data,error}=await client.from('mp_membres')
    .select('role,actif').eq('maquis_id',maquisId).eq('user_id',state.user.id).maybeSingle();
  if(error)throw error;
  if(!data?.actif)throw Error('Ce compte n’est pas autorisé dans ce maquis.');
  resetUI();
  state.role=data.role;state.tenant=maquisId;
  $('#appPanel').hidden=false;
  $('#authPanel').hidden=true;
  $('#appPanel').dataset.role=state.role;
  $('#connection').textContent='Connecté à Supabase';
  const server=state.role==='serveur';
  $('#stockManager').hidden=server;
  $('#catalogueExportPanel').hidden=server;
  $('#inventoryForm').hidden=server;
  $('#expenseManager').hidden=server;
  $('#teamForm').hidden=state.role!=='proprietaire';
  $$('.actions button').forEach(b=>b.hidden=server&&!['scan','stock'].includes(b.dataset.page));
  await refresh();
  showPage('scan');
  // Realtime réservé aux documents autorisés par RLS. Rafraîchissement de secours.
  state.channel=client.channel('mp-'+maquisId+'-'+state.user.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'mp_boissons',filter:'maquis_id=eq.'+maquisId},()=>void refresh())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'mp_ventes',filter:'maquis_id=eq.'+maquisId},()=>void refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'mp_caisse',filter:'maquis_id=eq.'+maquisId},()=>void refresh())
    .subscribe();
  state.refreshTimer=setInterval(()=>void refresh(),30000);
  status('Compte connecté. Ventes, stocks et caisse du maquis chargés.');
}
async function enterAfterAuth(user){
  resetUI();state.user=user;
  $('#logout').hidden=false;
  const admin=await rpc('mp_est_admin_igc');
  state.admin=admin===true;
  $('#adminPanel').hidden=!state.admin;
  const tenant=sessionStorage.getItem('mp_tenant')||$('#tenantId').value.trim();
  if(tenant){
    try{await enterTenant(tenant);}
    catch(e){status(errorText(e),true);$('#authPanel').hidden=false;}
  }else{
    $('#authPanel').hidden=false;
    status(state.admin?'Administrateur IGC connecté. Crée un maquis pour commencer.'
      :'Compte connecté. Saisis le code du maquis attribué par IGC.');
  }
}
async function sale(code){
  assertOnline();
  if(!state.tenant)throw Error('Maquis non sélectionné.');
  if(state.maquis?.statut!=='actif')throw Error('Licence inactive.');
  if(!/^[0-9]{8,14}$/.test(code))throw Error('Le code-barres doit contenir 8 à 14 chiffres.');
  if(state.pendingCode!==code){
    state.pendingId=crypto.randomUUID();
    state.pendingCode=code;
  }
  const receipt=await rpc('mp_scanner_vente',{
    p_maquis:state.tenant,p_code:code,p_operation:state.pendingId,
    p_paiement:$('#paymentMethod').value
  });
  state.pendingCode=null;state.pendingId=null;
  $('#scanMessage').classList.remove('bad');
  $('#scanMessage').textContent=(receipt.duplicata?'Scan déjà enregistré':'VENTE ENREGISTRÉE')+
    ' : '+receipt.boisson+' · '+money(receipt.prix)+
    (receipt.stock_restant===null||receipt.stock_restant===undefined?'':' · stock restant '+receipt.stock_restant);
  await refresh();
}
async function stopCamera(){
  if(state.scanTimer){clearInterval(state.scanTimer);state.scanTimer=null;}
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
  const el=$('#video');
  el.srcObject=null;el.hidden=true;
  $('#stopCamera').hidden=true;
  state.scanning=false;
}
async function startCamera(){
  assertOnline();
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia)
    throw Error('Caméra de scan non prise en charge. Utilise la saisie de code-barres.');
  await stopCamera();
  const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
  state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const video=$('#video');video.srcObject=state.stream;video.hidden=false;
  $('#stopCamera').hidden=false;await video.play();
  state.scanTimer=setInterval(async()=>{
    if(state.scanning||!state.stream||video.readyState<2)return;
    state.scanning=true;
    try{
      const results=await detector.detect(video);
      if(results?.[0]?.rawValue){
        const code=results[0].rawValue;
        await stopCamera(); // Une détection = une seule vente.
        try{await sale(code);}
        catch(e){$('#scanMessage').classList.add('bad');$('#scanMessage').textContent=errorText(e);}
      }
    }catch(e){status(errorText(e),true);}
    finally{state.scanning=false;}
  },650);
}
async function submitRpc(form,name,build,confirmation){
  try{
    assertOnline();
    const result=await rpc(name,build());
    form.reset();status(confirmation(result));
    await refresh();return result;
  }catch(e){status(errorText(e),true);return null;}
}
function bind(){
  $('#loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!configured)return status('Projet Supabase pas encore configuré.',true);
    if(!backendReady)return status('La base MaquisPro dédiée n’est pas encore créée.',true);
    const f=event.currentTarget;
    const tenant=f.elements.tenant.value.trim();
    if(tenant)sessionStorage.setItem('mp_tenant',tenant);
    else sessionStorage.removeItem('mp_tenant');
    const {data,error}=await client.auth.signInWithPassword({
      email:f.elements.email.value.trim(),password:f.elements.password.value
    });
    if(error)return status(errorText(error),true);
    try{await enterAfterAuth(data.user);}
    catch(e){status(errorText(e),true);}
  });
  $('#signup').addEventListener('click',async()=>{
    if(!configured||!backendReady)return status('Création de compte indisponible jusqu’à l’activation du pilote.',true);
    const f=$('#loginForm');
    try{
      const {data,error}=await client.auth.signUp({
        email:f.elements.email.value.trim(),password:f.elements.password.value
      });
      if(error)throw error;
      status(data.session?'Compte créé : demande à IGC ton accès au maquis.':'Vérifie ton e-mail pour confirmer le compte, puis contacte IGC.');
    }catch(e){status(errorText(e),true);}
  });
  $('#logout').onclick=async()=>{if(client)await client.auth.signOut();resetUI();
    state.user=null;state.admin=false;$('#adminPanel').hidden=true;$('#authPanel').hidden=false;$('#logout').hidden=true;status('Déconnecté.');};
  $$('.actions button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  $('#saleForm').onsubmit=async e=>{
    e.preventDefault();
    try{await sale($('#barcode').value.trim());}
    catch(error){$('#scanMessage').classList.add('bad');$('#scanMessage').textContent=errorText(error);status(errorText(error),true);}
  };
  $('#startCamera').onclick=async()=>{try{await startCamera();}catch(e){status(errorText(e),true);}};
  $('#stopCamera').onclick=()=>void stopCamera();
  $('#addDrinkForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget;
    void submitRpc(f,'mp_ajouter_boisson',()=>({
      p_maquis:state.tenant,p_nom:f.elements.nom.value.trim(),
      p_achat:Number(f.elements.prixAchat.value),p_vente:Number(f.elements.prixVente.value),
      p_code:f.elements.codeBarres.value.trim()||null
    }),()=> 'Boisson enregistrée ; ajoute ensuite son stock.');
  };
  $('#stockForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget;
    void submitRpc(f,'mp_approvisionner',()=>({
      p_maquis:state.tenant,p_boisson:f.elements.boissonId.value,
      p_quantite:Number(f.elements.quantite.value),p_cout_unitaire:Number(f.elements.coutUnitaire.value)
    }),x=>'Approvisionnement confirmé : '+x+' unités en stock.');
  };
  $('#expenseForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget;
    void submitRpc(f,'mp_depense',()=>({p_maquis:state.tenant,
      p_libelle:f.elements.libelle.value.trim(),p_montant:Number(f.elements.montant.value)}),
      ()=>'Dépense enregistrée.');
  };
  $('#inventoryForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget;
    const form=new FormData(f);const counts={};
    for(const p of state.products){
      const value=form.get(p.id);
      if(value!==null&&value!=='')counts[p.id]=Number(value);
    }
    void submitRpc(f,'mp_inventaire',()=>({
      p_maquis:state.tenant,p_periode:form.get('periodeType'),p_comptages:counts
    }),()=>'Inventaire enregistré ; aucune correction automatique du stock.');
  };
  $('#teamForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget;
    void submitRpc(f,'mp_ajouter_membre',()=>({
      p_maquis:state.tenant,p_email:f.elements.email.value.trim(),p_role:f.elements.role.value
    }),()=>'Accès collaborateur accordé sur cet établissement.');
  };
  $('#createMaquisForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget,data=new FormData(f);
    void submitRpc(f,'mp_creer_maquis',()=>({
      p_nom:data.get('nom'),p_ville:data.get('ville'),p_telephone:data.get('telephone'),
      p_email_proprietaire:data.get('ownerEmail')
    }),id=>'Maquis créé en attente de paiement : code '+id);
  };
  $('#activateForm').onsubmit=e=>{
    e.preventDefault();const f=e.currentTarget,data=new FormData(f);
    if(!window.confirm('IGC confirme avoir vérifié le paiement ? Cette action active l’abonnement.'))return;
    void submitRpc(f,'mp_activer_maquis',()=>({
      p_maquis:data.get('maquisId'),p_duree_mois:Number(data.get('dureeMois'))
    }),result=>'Licence activée. Expiration : '+new Date(result.expire_le).toLocaleDateString('fr-FR'));
  };
  function downloadCatalogue(format){
    if(!['proprietaire','gerant'].includes(state.role))return status('Export réservé aux responsables.',true);
    try{
      const filename=exportCatalogue(state.products,state.maquis?.nom||'MaquisPro',format);
      status('Catalogue téléchargé : '+filename);
    }catch(e){status(errorText(e),true);}
  }
  $('#exportExcel').onclick=()=>downloadCatalogue('xlsx');
  $('#exportWord').onclick=()=>downloadCatalogue('docx');
}
async function init(){
  bind();
  if(!configured||!backendReady){
    $('#configWarning').hidden=false;
    $('#configWarning').textContent=(!configured
      ?'Le projet Supabase MaquisPro indépendant doit encore être créé et configuré.'
      :'Le schéma sécurisé MaquisPro n’est pas encore déployé.')+
      ' Aucun paiement ni aucune vente réelle ne sont actifs.';
    $('#backendNotice').textContent='Version pilote de développement — opérations commerciales désactivées.';
    status('Supabase MaquisPro en préparation ; la démonstration Render reste disponible.',true);
    for(const f of ['loginForm','addDrinkForm','stockForm','saleForm','expenseForm','inventoryForm','teamForm','createMaquisForm','activateForm']){
      document.querySelectorAll('#'+f+' button').forEach(b=>b.disabled=true);
    }
    $('#startCamera').disabled=true;
    return;
  }
  try{
    const {data:{user},error}=await client.auth.getUser();
    if(error)throw error;
    if(user)await enterAfterAuth(user);
    else status('Connecte-toi avec ton compte Supabase MaquisPro.');
    client.auth.onAuthStateChange((event,session)=>{
      // Les connexions explicites sont gérées par le formulaire ; ici déconnexion externe.
      if(event==='SIGNED_OUT'){
        resetUI();state.user=null;state.admin=false;
        $('#appPanel').hidden=true;$('#adminPanel').hidden=true;$('#authPanel').hidden=false;
        $('#logout').hidden=true;
      }
    });
  }catch(e){status(errorText(e),true);}
}
void init();
