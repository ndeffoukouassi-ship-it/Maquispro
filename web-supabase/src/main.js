import { createClient } from '@supabase/supabase-js';
import { exportCatalogue } from './catalog-export.js';
import {resumeParc,filtrerParc,TARIFS_IGC} from './admin-summary.mjs';
import {emailRateLimit,authMessage,waitLabel,EMAIL_RETRY_MINUTES,EMAIL_LIMIT_MINUTES} from './auth-feedback.mjs';
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
const salesReady=import.meta.env.VITE_MAQUISPRO_SALES_ENABLED==='true';
const recoveryLink=typeof window!=='undefined' && new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')==='recovery';
const managerInviteParam=typeof window!=='undefined'
  ?new URLSearchParams(window.location.search).get('invitation'):null;
const validInviteToken=/^[0-9a-f]{64}$/;
const client=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

const state={
  user:null,role:null,maquis:null,tenant:null,admin:false,products:[],sales:[],
  stats:{},refreshing:false,generation:0,channel:null,refreshTimer:null,
  adminClients:[],adminLoading:false,adminTruncated:false,
  myMaquis:[],invitationToken:validInviteToken.test(managerInviteParam||'')?managerInviteParam:null,
  managerLink:'',
  stream:null,scanTimer:null,scanning:false,pendingId:null,pendingCode:null,recoveryMode:false
};
function status(message,bad=false){
  $('#status').textContent=message;
  $('#status').classList.toggle('error',bad);
}
function errorText(e){
  const message=authMessage(e);
  if(message)return message;
  if(e?.message?.includes('JWT'))return 'Session expirée. Reconnecte-toi.';
  if(e?.message?.includes('permission')||e?.code==='42501')return 'Accès refusé à ce maquis.';
  if(e?.message?.includes('fetch')||e?.message?.includes('network'))return 'Réseau indisponible : aucune vente confirmée.';
  return (e?.message||String(e)||'Une erreur est survenue').slice(0,230);
}

const emailCooldownKey='maquispro-auth-emails-next-at-v1';
let emailSending=false;
let emailCooldownTimer=null;
// Un seul délai côté appareil pour l'inscription, la confirmation et le mot de passe.
function emailWaitMs(){
  try{
    const expiry=Number(localStorage.getItem(emailCooldownKey))||0;
    return Math.max(0,expiry-Date.now());
  }catch{return 0;}
}
function setEmailCooldown(minutes){
  try{localStorage.setItem(emailCooldownKey,String(Date.now()+minutes*60000));}catch{}
  refreshEmailControls();
}
function refreshEmailControls(){
  const waiting=emailWaitMs();
  const disabled=emailSending||waiting>0;
  for(const id of ['signup','resendConfirm','forgotPassword','requestInviteCode']){
    const button=$('#'+id);if(button)button.disabled=disabled;
  }
  const help=$('#emailHelp');
  if(help)help.textContent=waiting>0
    ?'Envoi d’e-mails en pause sur ce téléphone : '+waitLabel(waiting)+
      ' environ. Cette pause évite les demandes répétées ; le quota réel dépend de Supabase. Tu peux toujours utiliser « Se connecter ».'
    :emailSending
      ?'Demande en cours. Un seul clic suffit.'
      :'Pour éviter le blocage Supabase, demande un seul e-mail puis utilise le dernier lien reçu. Ne recrée pas ton compte.';
  if(waiting>0&&!emailCooldownTimer){
    emailCooldownTimer=setInterval(()=>{
      if(emailWaitMs()===0){clearInterval(emailCooldownTimer);emailCooldownTimer=null;}
      refreshEmailControls();
    },30000);
  }else if(waiting===0&&emailCooldownTimer){
    clearInterval(emailCooldownTimer);emailCooldownTimer=null;
  }
}
function canRequestEmail(){
  if(!configured||!backendReady){status('Authentification Supabase indisponible.',true);return false;}
  if(emailSending){status('Demande déjà en cours. Un seul clic suffit.',true);return false;}
  const waiting=emailWaitMs();
  if(waiting>0){
    status('Nous évitons une nouvelle demande pendant encore '+waitLabel(waiting)+
      '. Supabase peut conserver sa limite plus longtemps.',true);
    return false;
  }
  return true;
}
async function emailAction(action,success){
  if(!canRequestEmail())return;
  const email=$('#email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    status('Écris ton adresse e-mail dans le champ « E-mail » avant de cliquer.',true);
    return;
  }
  emailSending=true;refreshEmailControls();
  try{
    const {error}=await action(email);
    if(error)throw error;
    setEmailCooldown(EMAIL_RETRY_MINUTES);
    status(success);
  }catch(e){
    if(emailRateLimit(e))setEmailCooldown(EMAIL_LIMIT_MINUTES);
    status(errorText(e),true);
  }finally{emailSending=false;refreshEmailControls();}
}
function showAuthLinkError(){
  const params=new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(!params.get('error_code'))return;
  status(authMessage({code:params.get('error_code'),message:params.get('error_description')})||
    'Lien de confirmation invalide. Utilise le dernier lien valide reçu.',true);
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
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
  $('#myMaquisPanel').hidden=true;
  $('#appPanel').dataset.role='';
  $('#connection').textContent='Non connecté à un maquis';
}
function showPasswordChange(){
  // N'afficher le formulaire de modification qu'avec une session authentifiée.
  state.recoveryMode=true;
  $('#authPanel').hidden=true;
  $('#appPanel').hidden=true;
  $('#adminPanel').hidden=true;
  $('#myMaquisPanel').hidden=true;
  $('#invitationPanel').hidden=true;
  $('#passwordRecoveryPanel').hidden=false;
  $('#changePassword').hidden=true;
  $('#logout').hidden=true;
  status('Choisis ton nouveau mot de passe MaquisPro (12 caractères minimum).');
}
function showAuthAfterRecovery(){
  state.recoveryMode=false;
  $('#passwordRecoveryPanel').hidden=true;
  $('#authPanel').hidden=false;
  $('#appPanel').hidden=true;
  $('#adminPanel').hidden=true;
  $('#myMaquisPanel').hidden=true;
  $('#invitationPanel').hidden=true;
  $('#changePassword').hidden=true;
  $('#logout').hidden=true;
}
function nameRole(role){
  return role==='proprietaire'?'Propriétaire':role==='gerant'?'Gérant':'Serveur';
}
function showPage(page){
  if(state.role==='serveur'&&!['scan','stock'].includes(page)){
    status('Cette rubrique est réservée au gérant.',true);return;
  }
  const target=document.getElementById('page-'+page);
  if(!target)return;
  $('.page').forEach(x=>x.hidden=x!==target);
  // L'onglet actif reste visuellement enfoncé et identifiable au clavier.
  $('.actions button[data-page]').forEach(button=>{
    const active=button.dataset.page===page;
    button.classList.toggle('is-current',active);
    button.setAttribute('aria-pressed',String(active));
  });
  if(page!=='scan')void stopCamera();
}
// Suivi commercial IGC : lecture seule et filtrée par les règles RLS Supabase.
const displayDate=value=>{
  const date=value?new Date(value):null;
  return date&&Number.isFinite(date.getTime())
    ?date.toLocaleDateString('fr-FR',{timeZone:'Africa/Abidjan',day:'2-digit',month:'2-digit',year:'numeric'})
    :'—';
};
function renderAdminClients(){
  if(!state.admin)return;
  const stats=resumeParc(state.adminClients);
  $('#adminTotal').textContent=stats.total;
  $('#adminActive').textContent=stats.actifs;
  $('#adminDue').textContent=stats.aRenouveler;
  $('#adminPending').textContent=stats.enAttente;
  $('#adminExpired').textContent=stats.expires;
  $('#adminSuspended').textContent=stats.suspendus;
  const rows=filtrerParc(state.adminClients,$('#adminSearch').value,$('#adminFilter').value);
  $('#adminRows').innerHTML=rows.length?rows.map(m=>{
    const status=m.licence;
    const period=m.periode_abonnement==='annuel'?'Annuel':m.periode_abonnement==='mensuel'?'Mensuel':'Non choisie';
    const renewal=status.days!==null&&status.days>=0&&status.key==='bientot'?' ('+status.days+' j)':'';
    return '<tr><td><strong>'+esc(m.nom)+'</strong><small>'+esc(m.ville||'Ville non renseignée')+'</small><code>'+esc(m.id)+'</code></td>'+
      '<td>'+period+'</td><td><span class="admin-status admin-status-'+esc(status.key)+'">'+esc(status.label)+renewal+'</span></td>'+
      '<td>'+displayDate(m.expire_le)+'</td><td><button class="secondary3d admin-select" type="button" data-admin-select="'+esc(m.id)+'">'+
      (status.key==='en_attente'?'Préparer activation':'Préparer renouvellement')+'</button></td></tr>';
  }).join(''):'<tr><td colspan="5">Aucun maquis dans ce filtre.</td></tr>';
  const countText=rows.length+' établissement(s) affiché(s) sur '+stats.total+'.';
  $('#adminCountNote').textContent=countText+
    (state.adminTruncated?' Affichage limité aux 500 établissements les plus récents.':'')+
    ' Les montants sont des tarifs contractuels, pas des paiements vérifiés. Les ventes réelles restent verrouillées.';
}
async function loadAdminClients(){
  if(!client||!state.admin||state.adminLoading)return;
  state.adminLoading=true;
  $('#adminRefresh').disabled=true;
  try{
    // L'accès global est donné uniquement aux membres de mp_igc_admins via RLS.
    const {data,error}=await client.from('mp_maquis')
      .select('id,nom,ville,statut,periode_abonnement,active_le,expire_le,cree_le,installation_fcfa,mensualite_fcfa,annuel_fcfa')
      .order('cree_le',{ascending:false}).limit(501);
    if(error)throw error;
    state.adminTruncated=(data||[]).length>500;
    state.adminClients=(data||[]).slice(0,500);
    renderAdminClients();
  }catch(e){
    status('Liste des clients inaccessible : '+errorText(e),true);
  }finally{
    state.adminLoading=false;
    $('#adminRefresh').disabled=false;
  }
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

function renderMyMaquis(){
  const panel=$('#myMaquisPanel');
  const list=$('#myMaquisList');
  $('#chooseMaquis').hidden=state.myMaquis.length===0;
  list.innerHTML=state.myMaquis.length?state.myMaquis.map(m=>
    '<article class="maquis-choice">'+
    '<div><strong>'+esc(m.nom)+'</strong><small>'+esc(m.ville||'Ville non renseignée')+
    ' · '+(m.role==='proprietaire'?'Propriétaire':m.role==='gerant'?'Gérant':'Serveur')+
    ' · '+esc(m.statut)+'</small></div>'+
    '<button type="button" class="green3d" data-enter-maquis="'+esc(m.id)+'">Ouvrir ce maquis</button>'+
    '</article>'
  ).join(''):'<p>Aucun maquis ne t’a encore été attribué.</p>';
  panel.hidden=state.myMaquis.length===0;
}
async function loadMyMaquis(){
  state.myMaquis=[];
  if(!client||!state.user)return;
  const {data:members,error}=await client.from('mp_membres')
    .select('maquis_id,role').eq('user_id',state.user.id).eq('actif',true);
  if(error)throw error;
  const ids=(members||[]).map(m=>m.maquis_id);
  if(ids.length){
    const {data:maquis,error:err}=await client.from('mp_maquis')
      .select('id,nom,ville,statut,proprietaire_uid').in('id',ids);
    if(err)throw err;
    const byId=new Map((maquis||[]).map(m=>[m.id,m]));
    state.myMaquis=(members||[]).filter(m=>byId.has(m.maquis_id)).map(m=>({
      ...byId.get(m.maquis_id),role:m.role
    })).sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  }
  renderMyMaquis();
}
function openMyMaquis(){
  if(!state.user)return status('Connecte-toi pour afficher tes maquis.',true);
  resetUI();
  renderMyMaquis();
  $('#authPanel').hidden=true;
  $('#adminPanel').hidden=!state.admin;
  $('#invitationPanel').hidden=true;
  $('#logout').hidden=false;
  $('#changePassword').hidden=false;
  status('Choisis le maquis que tu souhaites gérer ou consulter.');
}
function showManagerInvitation(){
  $('#invitationPanel').hidden=false;
  $('#myMaquisPanel').hidden=true;
  $('#authPanel').hidden=true;
  $('#appPanel').hidden=true;
  $('#adminPanel').hidden=true;
  $('#passwordRecoveryPanel').hidden=true;
  $('#chooseMaquis').hidden=true;
  $('#changePassword').hidden=true;
  $('#logout').hidden=!state.user;
}
async function loadCurrentManager(){
  if(state.role!=='proprietaire'||!state.tenant)return;
  const current=await rpc('mp_gerant_du_maquis',{p_maquis:state.tenant});
  if(!state.tenant||state.role!=='proprietaire')return;
  const manager=Array.isArray(current)?current[0]:null;
  $('#managerCurrent').textContent=manager
    ?'Gérant actuel : '+manager.email+' (un seul gérant autorisé)'
    :'Aucun gérant actif pour ce maquis.';
  $('#managerInviteForm').hidden=!!manager;
  $('#removeManager').hidden=!manager;
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
  $('#myMaquisPanel').hidden=true;
  $('#invitationPanel').hidden=true;
  $('#authPanel').hidden=true;
  $('#appPanel').dataset.role=state.role;
  $('#connection').textContent='Connecté à Supabase';
  const server=state.role==='serveur';
  $('#stockManager').hidden=server;
  $('#catalogueExportPanel').hidden=server;
  $('#inventoryForm').hidden=server;
  $('#expenseManager').hidden=server;
  $('#teamForm').hidden=state.role!=='proprietaire';
  $('#managerInviteCard').hidden=state.role!=='proprietaire';
  $('#managerInviteOutput').hidden=true;
  if(state.role==='proprietaire')await loadCurrentManager();
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
  $('#changePassword').hidden=false;
  $('#passwordRecoveryPanel').hidden=true;
  state.recoveryMode=false;
  state.admin=await rpc('mp_est_admin_igc')===true;
  state.adminClients=[];
  $('#adminPanel').hidden=!state.admin;
  if(state.admin)await loadAdminClients();
  await loadMyMaquis();
  if(state.invitationToken){
    showManagerInvitation();
    status('Connecte-toi avec l’e-mail invité, puis confirme ton rôle de gérant.');
    return;
  }
  const tenant=sessionStorage.getItem('mp_tenant')||$('#tenantId').value.trim();
  const selected=state.myMaquis.find(m=>m.id===tenant);
  if(tenant&&!selected){
    sessionStorage.removeItem('mp_tenant');
    $('#tenantId').value='';
  }
  if(selected){
    try{await enterTenant(selected.id);return;}
    catch(e){status(errorText(e),true);}
  }
  if(state.myMaquis.length===1){
    await enterTenant(state.myMaquis[0].id);
    return;
  }
  if(state.myMaquis.length>1){
    $('#authPanel').hidden=true;
    $('#myMaquisPanel').hidden=false;
    status('Choisis ton maquis. Chaque établissement a sa propre caisse et son propre gérant.');
    return;
  }
  $('#myMaquisPanel').hidden=true;
  $('#authPanel').hidden=state.admin;
  status(state.admin?'Administrateur IGC connecté. Inscris les établissements de tes clients.'
    :'Compte connecté. Aucun maquis ne t’a encore été attribué par le propriétaire ou IGC.');
}
async function sale(code){
  assertOnline();
  if(!salesReady)throw Error('Ventes désactivées pendant la préparation du maquis pilote.');
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
  if(!salesReady)throw Error('Scanner désactivé tant que les ventes ne sont pas validées.');
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
    await refresh();
    if(state.admin)await loadAdminClients();
    return result;
  }catch(e){status(errorText(e),true);return null;}
}
function bind(){
  $('#chooseMaquis').onclick=()=>openMyMaquis();
  $('#myMaquisList').addEventListener('click',async e=>{
    const button=e.target.closest('button[data-enter-maquis]');
    if(!button||!state.user)return;
    const id=button.dataset.enterMaquis;
    if(!uuidRE.test(id)||!state.myMaquis.some(m=>m.id===id))return;
    button.disabled=true;
    try{
      sessionStorage.setItem('mp_tenant',id);
      await enterTenant(id);
    }catch(error){status(errorText(error),true);}
    finally{button.disabled=false;}
  });
  $('#managerInviteForm').onsubmit=async e=>{
    e.preventDefault();
    if(state.role!=='proprietaire'||!uuidRE.test(state.tenant||''))return;
    const form=e.currentTarget;
    const email=form.elements.email.value.trim().toLowerCase();
    const button=form.querySelector('button[type=submit]');
    button.disabled=true;
    try{
      const token=await rpc('mp_inviter_gerant',{p_maquis:state.tenant,p_email:email});
      if(!validInviteToken.test(token||''))throw Error('Réponse de création d’invitation invalide.');
      state.managerLink=window.location.origin+'/?invitation='+token;
      $('#managerInviteLink').value=state.managerLink;
      $('#managerInviteOutput').hidden=false;
      form.reset();
      status('Lien personnel créé pour '+email+'. Il expire dans 48 heures et donne accès à un seul maquis.');
    }catch(error){status(errorText(error),true);}
    finally{button.disabled=false;}
  };
  $('#copyManagerInvitation').onclick=async()=>{
    if(!state.managerLink)return status('Crée d’abord une invitation.',true);
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(state.managerLink);
        status('Lien copié. Transmets-le uniquement au gérant concerné.');
      }else{
        window.prompt('Copie ce lien personnel puis envoie-le au gérant :',state.managerLink);
      }
    }catch(error){status('Copie le lien affiché et envoie-le au gérant.',true);}
  };
  $('#removeManager').onclick=async()=>{
    if(state.role!=='proprietaire'||!state.tenant)return;
    if(!window.confirm('Retirer immédiatement l’accès de ce gérant au maquis ?'))return;
    try{
      await rpc('mp_retirer_gerant',{p_maquis:state.tenant});
      state.managerLink='';
      $('#managerInviteOutput').hidden=true;
      await loadCurrentManager();
      status('L’accès du gérant a été retiré. Tu peux inviter un autre gérant.');
    }catch(error){status(errorText(error),true);}
  };
  $('#requestInviteCode').onclick=async()=>{
    if(!state.invitationToken||!canRequestEmail())return;
    const email=$('#invitedEmail').value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      return status('Saisis l’adresse e-mail que le propriétaire a invitée.',true);
    }
    emailSending=true;refreshEmailControls();
    try{
      const {error}=await client.auth.signInWithOtp({
        email,options:{
          shouldCreateUser:true,
          emailRedirectTo:window.location.origin+'/?invitation='+state.invitationToken
        }
      });
      if(error)throw error;
      setEmailCooldown(EMAIL_RETRY_MINUTES);
      status('Vérifie ton e-mail. Saisis le code à six chiffres reçu, ou ouvre le lien de connexion si Supabase envoie un lien.');
    }catch(error){
      if(emailRateLimit(error))setEmailCooldown(EMAIL_LIMIT_MINUTES);
      status(errorText(error),true);
    }finally{emailSending=false;refreshEmailControls();}
  };
  $('#verifyInviteCode').onclick=async()=>{
    if(!state.invitationToken)return status('Lien d’invitation manquant ou expiré.',true);
    const email=$('#invitedEmail').value.trim().toLowerCase();
    const code=$('#inviteOtp').value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9]{6}$/.test(code)){
      return status('Indique ton e-mail invité et le code temporaire à six chiffres.',true);
    }
    const button=$('#verifyInviteCode');button.disabled=true;
    try{
      const {data,error}=await client.auth.verifyOtp({email,token:code,type:'email'});
      if(error)throw error;
      const user=data?.user||(await client.auth.getUser()).data?.user;
      if(!user)throw Error('Vérification réussie, mais la session n’est pas disponible.');
      await enterAfterAuth(user);
      showManagerInvitation();
      status('E-mail vérifié. Appuie maintenant sur « Accepter l’invitation ».');
    }catch(error){status(errorText(error),true);}
    finally{button.disabled=false;}
  };
  $('#acceptManagerInvitation').onclick=async()=>{
    if(!state.invitationToken)return status('Invitation manquante.',true);
    const button=$('#acceptManagerInvitation');button.disabled=true;
    try{
      const {data:{user},error:userError}=await client.auth.getUser();
      if(userError||!user)throw Error('Connecte-toi avec le code reçu sur l’e-mail invité.');
      const id=await rpc('mp_accepter_invitation_gerant',{p_token:state.invitationToken});
      if(!uuidRE.test(id))throw Error('Impossible de récupérer le code de ton maquis.');
      state.invitationToken=null;
      const address=new URL(window.location.href);
      address.searchParams.delete('invitation');
      window.history.replaceState(null,'',address.pathname+address.search+address.hash);
      sessionStorage.setItem('mp_tenant',id);
      await enterAfterAuth(user);
      status('Invitation acceptée. Tu peux gérer ton maquis depuis cet espace.');
    }catch(error){status(errorText(error),true);}
    finally{button.disabled=false;}
  };
  $('#inviteSwitchAccount').onclick=async()=>{
    if(client)await client.auth.signOut();
    state.user=null;
    resetUI();
    showManagerInvitation();
    status('Saisis l’adresse invitée et demande un code de connexion. Aucun mot de passe nécessaire.');
  };
  $('#loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!configured)return status('Projet Supabase pas encore configuré.',true);
    if(!backendReady)return status('La base MaquisPro dédiée n’est pas encore créée.',true);
    const f=event.currentTarget;
    const tenant=f.elements.tenant.value.trim();
    if(tenant && !uuidRE.test(tenant)){
      // Aide à la saisie sans envoyer un code de maquis invalide à Supabase.
      f.elements.tenant.value='';
      sessionStorage.removeItem('mp_tenant');
      status('Code du maquis effacé : pour l’administration IGC, laisse ce champ vide. Connecte-toi avec ton e-mail et ton mot de passe.');
    } else if(tenant)sessionStorage.setItem('mp_tenant',tenant);
    else sessionStorage.removeItem('mp_tenant');
    const {data,error}=await client.auth.signInWithPassword({
      email:f.elements.email.value.trim(),password:f.elements.password.value
    });
    if(error)return status(errorText(error),true);
    try{await enterAfterAuth(data.user);}
    catch(e){status(errorText(e),true);}
  });
  $('#signup').addEventListener('click',async()=>{
    if(!canRequestEmail())return;
    const f=$('#loginForm');
    const email=f.elements.email.value.trim();
    const password=f.elements.password.value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return status('Saisis une adresse e-mail valide.',true);
    if(password.length<8)return status('Saisis un mot de passe de 8 caractères minimum.',true);
    emailSending=true;refreshEmailControls();
    try{
      const {data,error}=await client.auth.signUp({
        email,password,options:{emailRedirectTo:window.location.origin}
      });
      if(error)throw error;
      setEmailCooldown(EMAIL_RETRY_MINUTES);
      status(data.session?'Compte créé. Demande ensuite à IGC les droits d’accès.':
        'La demande d’inscription a été enregistrée. Vérifie le dernier e-mail de confirmation (y compris les spams).');
    }catch(e){
      if(emailRateLimit(e))setEmailCooldown(EMAIL_LIMIT_MINUTES);
      status(errorText(e),true);
    }finally{emailSending=false;refreshEmailControls();}
  });
  // Confirmation d'adresse e-mail : pas de nouveau compte créé.
  $('#resendConfirm').addEventListener('click',()=>emailAction(
    email=>client.auth.resend({type:'signup',email,options:{emailRedirectTo:window.location.origin}}),
    'Confirmation demandée. Si Supabase autorise l’envoi, vérifie le dernier message dans ta boîte et tes spams.'
  ));
  $('#forgotPassword').addEventListener('click',()=>emailAction(
    email=>client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/'}),
    'Réinitialisation demandée. Si Supabase autorise l’envoi, vérifie ta boîte e-mail et les spams.'
  ));
  $('#changePassword').addEventListener('click',()=>{
    if(!client||!state.user)return status('Connecte-toi d’abord à MaquisPro.',true);
    showPasswordChange();
  });
  $('#passwordRecoveryForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!client||!state.recoveryMode)return status('Ouvre le lien de récupération reçu par e-mail.',true);
    const form=e.currentTarget;
    const next=form.elements.newPassword.value;
    const confirm=form.elements.confirmPassword.value;
    if(next.length<12)return status('Choisis au moins 12 caractères.',true);
    if(next!==confirm)return status('Les deux mots de passe ne sont pas identiques.',true);
    const button=form.querySelector('button[type=submit]');
    button.disabled=true;
    try{
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError||!session)throw new Error('Le lien a expiré. Demande un nouveau courriel de réinitialisation.');
      const {error}=await client.auth.updateUser({password:next});
      if(error)throw error;
      form.reset();
      await client.auth.signOut();
      showAuthAfterRecovery();
      status('Ton mot de passe MaquisPro a été modifié. Connecte-toi avec ton nouveau mot de passe.');
    }catch(error){status(errorText(error),true);}
    finally{button.disabled=false;}
  });
  $('#logout').onclick=async()=>{if(client)await client.auth.signOut();resetUI();
    state.user=null;state.admin=false;state.adminClients=[];showAuthAfterRecovery();status('Déconnecté.');};
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
  $('#adminRefresh').addEventListener('click',()=>void loadAdminClients());
  $('#adminSearch').addEventListener('input',renderAdminClients);
  $('#adminFilter').addEventListener('change',renderAdminClients);
  $('#adminRows').addEventListener('click',e=>{
    const b=e.target.closest('button[data-admin-select]');
    if(!state.admin||!b||!uuidRE.test(b.dataset.adminSelect))return;
    const item=state.adminClients.find(m=>m.id===b.dataset.adminSelect);
    if(!item)return;
    const form=$('#activateForm');
    form.elements.maquisId.value=item.id;
    form.elements.dureeMois.value=item.periode_abonnement==='annuel'?'12':'1';
    form.scrollIntoView({behavior:'smooth',block:'center'});
    status('Licence sélectionnée : '+item.nom+'. Vérifie le paiement avant toute activation.');
  });
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
  refreshEmailControls();
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
    if(!salesReady){
      $('#backendNotice').textContent='Comptes et catalogue disponibles. Caisse et ventes bloquées par IGC pendant les contrôles.';
      $('#saleForm').querySelectorAll('button').forEach(b=>b.disabled=true);
      $('#startCamera').disabled=true;
    }
    // S'abonner avant l'initialisation de session pour capter PASSWORD_RECOVERY.
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY' && session){
        showPasswordChange();
        return;
      }
      if(event==='SIGNED_OUT'){
        resetUI();state.user=null;state.admin=false;showAuthAfterRecovery();
      }
    });
    const {data:{session},error}=await client.auth.getSession();
    if(error)throw error;
    if(session && (state.recoveryMode||recoveryLink)){
      showPasswordChange();
    }else if(session){
      const {data:{user},error:userError}=await client.auth.getUser();
      if(userError)throw userError;
      if(user)await enterAfterAuth(user);
    }else if(state.invitationToken){
      showManagerInvitation();
      status('Invitation reçue. Saisis ton e-mail et demande un code de connexion sans mot de passe.');
    }else status('Projet Supabase connecté. Crée ton compte IGC ou connecte-toi.');
  }catch(e){status(errorText(e),true);}
}
void init().then(showAuthLinkError);
