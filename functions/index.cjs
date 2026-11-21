'use strict';

const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const V=require('./core.cjs');

initializeApp();
const db=getFirestore();
const callOptions={region:'europe-west1',maxInstances:4,memory:'256MiB'};

function requireAuth(req){
  const uid=req.auth?.uid;
  if(!uid)throw new HttpsError('unauthenticated','Connexion nécessaire.');
  return uid;
}
function fail(code,message){throw new HttpsError(code,message);}
function checkInput(action){
  try{return action();}
  catch(error){fail('invalid-argument',error.message);}
}
async function checkTenant(tx,maquisId,uid,roles){
  const root=db.doc('maquis/'+maquisId);
  const member=root.collection('membres').doc(uid);
  const [a,b]=await Promise.all([tx.get(root),tx.get(member)]);
  if(!a.exists || a.data().statut!=='actif') fail('failed-precondition','Licence ou maquis non actif.');
  if(!b.exists || b.data().actif!==true || !roles.includes(b.data().role))
    fail('permission-denied','Accès non autorisé à cet établissement.');
  return root;
}
function adminOnly(req){
  requireAuth(req);
  if(req.auth.token?.platformAdmin!==true) fail('permission-denied','Administrateur IGC requis.');
}
function value(req,key){return req.data?.[key];}

exports.createMaquis=onCall(callOptions,async req=>{
  adminOnly(req);
  const name=checkInput(()=>V.requiredText(value(req,'nom'),'Nom du maquis',80));
  const email=checkInput(()=>V.requiredText(value(req,'ownerEmail'),'E-mail du propriétaire',160).toLowerCase());
  const telephone=checkInput(()=>V.requiredText(value(req,'telephone'),'Téléphone',32));
  const ville=checkInput(()=>V.requiredText(value(req,'ville'),'Ville',80));
  const owner=await getAuth().getUserByEmail(email).catch(()=>fail('not-found','Le propriétaire doit d’abord créer son compte.'));
  const maquis=db.collection('maquis').doc();
  await db.runTransaction(async tx=>{
    tx.create(maquis,{nom:name,telephone,ville,adresse:'',proprietaireUid:owner.uid,
      gerantUid:null,statut:'en_attente',devise:'XOF',fuseauHoraire:'Africa/Abidjan',
      creeLe:FieldValue.serverTimestamp(),dateActivation:null,logoUrl:null});
    tx.create(maquis.collection('membres').doc(owner.uid),
      {role:'proprietaire',actif:true,nomAffiche:owner.displayName||email,ajouteLe:FieldValue.serverTimestamp(),ajoutePar:req.auth.uid});
    tx.create(maquis.collection('licence').doc('actuelle'),{statut:'en_attente',activeLe:null,plan:null});
  });
  return {maquisId:maquis.id,statut:'en_attente'};
});

exports.activateMaquis=onCall(callOptions,async req=>{
  adminOnly(req);
  const id=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const root=db.doc('maquis/'+id),licence=root.collection('licence').doc('actuelle');
  await db.runTransaction(async tx=>{
    const [a,l]=await Promise.all([tx.get(root),tx.get(licence)]);
    if(!a.exists || !l.exists)fail('not-found','Établissement inconnu.');
    if(a.data().statut==='actif')return;
    tx.update(root,{statut:'actif',dateActivation:FieldValue.serverTimestamp()});
    tx.update(licence,{statut:'actif',activeLe:FieldValue.serverTimestamp()});
  });
  return {maquisId:id,statut:'actif'};
});

exports.addMember=onCall(callOptions,async req=>{
  const uid=requireAuth(req);
  const tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const email=checkInput(()=>V.requiredText(value(req,'email'),'E-mail',160).toLowerCase());
  const role=value(req,'role');
  if(!['gerant','serveur'].includes(role))fail('invalid-argument','Rôle invalide.');
  const user=await getAuth().getUserByEmail(email).catch(()=>fail('not-found','Créer d’abord le compte du collaborateur.'));
  const target=db.doc('maquis/'+tenant+'/membres/'+user.uid);
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire']);
    const existing=await tx.get(target);
    const details={role,actif:true,nomAffiche:user.displayName||email,ajoutePar:uid,ajouteLe:FieldValue.serverTimestamp()};
    if(existing.exists)tx.update(target,details);
    else tx.create(target,details);
  });
  return {uid:user.uid,role};
});

exports.addDrink=onCall(callOptions,async req=>{
  const uid=requireAuth(req),tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const name=checkInput(()=>V.requiredText(value(req,'nom'),'Nom de boisson',90));
  const sell=checkInput(()=>V.amount(value(req,'prixVente'),'Prix de vente'));
  const cost=checkInput(()=>V.amount(value(req,'prixAchat'),'Prix d’achat',{zero:true}));
  const code=checkInput(()=>V.barcode(value(req,'codeBarres')));
  const product=db.collection('maquis').doc(tenant).collection('boissons').doc();
  const index=code ? db.doc('maquis/'+tenant+'/codesbarres/'+code):null;
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire','gerant']);
    if(index){
      const existing=await tx.get(index);
      if(existing.exists)fail('already-exists','Ce code-barres est déjà utilisé.');
    }
    tx.create(product,{nom:name,prixVente:sell,prixAchat:cost,stockActuel:0,
      codeBarres:code,actif:true,seuilAlerte:5,majLe:FieldValue.serverTimestamp()});
    if(index)tx.create(index,{boissonId:product.id});
  });
  return {boissonId:product.id,nom:name,stockActuel:0};
});

exports.stockIn=onCall(callOptions,async req=>{
  const uid=requireAuth(req),tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const productId=checkInput(()=>V.requiredId(value(req,'boissonId'),'Boisson'));
  const qty=checkInput(()=>V.amount(value(req,'quantite'),'Quantité'));
  const cost=checkInput(()=>V.amount(value(req,'coutUnitaire'),'Coût unitaire',{zero:true}));
  const root=db.doc('maquis/'+tenant),p=root.collection('boissons').doc(productId);
  const movement=root.collection('mouvements_stock').doc();
  let newStock=0;
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire','gerant']);
    const snapshot=await tx.get(p);
    if(!snapshot.exists)fail('not-found','Boisson inconnue.');
    const old=snapshot.data().stockActuel;
    if(!Number.isSafeInteger(old)||old<0||old+qty>1000000000)fail('failed-precondition','Stock invalide.');
    newStock=old+qty;
    // Coût moyen pondéré simplifié. Les stocks de lots historiques demandent une comptabilité plus avancée.
    const avg=Math.round((old*snapshot.data().prixAchat+qty*cost)/newStock);
    tx.update(p,{stockActuel:newStock,prixAchat:avg,majLe:FieldValue.serverTimestamp()});
    tx.create(movement,{boissonId:productId,quantiteSignee:qty,type:'approvisionnement',
      coutUnitaire:cost,effectueParUid:uid,creeLe:FieldValue.serverTimestamp()});
  });
  return {boissonId:productId,stockActuel:newStock};
});

exports.saleScan=onCall(callOptions,async req=>{
  const uid=requireAuth(req),tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const code=checkInput(()=>V.barcode(value(req,'codeBarres')));
  if(!code)fail('invalid-argument','Scanne une bouteille avec code-barres enregistré.');
  const op=checkInput(()=>V.requiredId(value(req,'scanOperationId'),'Identifiant de scan'));
  const method=checkInput(()=>V.validateMethod(value(req,'modePaiement')));
  const root=db.doc('maquis/'+tenant),index=root.collection('codesbarres').doc(code),
    saleRef=root.collection('ventes').doc(op),cashRef=root.collection('caisse').doc(V.dayId()),
    stockRef=root.collection('mouvements_stock').doc(op);
  let receipt;
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire','gerant','serveur']);
    const [prior,lookup]=await Promise.all([tx.get(saleRef),tx.get(index)]);
    if(prior.exists){
      const d=prior.data();
      if(d.serveurUid!==uid||d.codeBarres!==code)fail('already-exists','Opération déjà utilisée.');
      receipt={operationId:op,boisson:d.nomBoisson,prix:d.prixVenteUnitaire,
        marge:d.beneficeBrut,stockRestant:null,duplicata:true};
      return;
    }
    if(!lookup.exists)fail('not-found','Code-barres inconnu. Aucune vente.');
    const pid=lookup.data().boissonId;
    const drinkRef=root.collection('boissons').doc(pid);
    const [p,cash]=await Promise.all([tx.get(drinkRef),tx.get(cashRef)]);
    if(!p.exists||p.data().actif!==true||p.data().codeBarres!==code)
      fail('not-found','Boisson indisponible.');
    let sale;
    try{sale=V.checkSale(p.data());}
    catch(e){fail('failed-precondition',e.message);}
    if(cash.exists && cash.data().statut==='cloturee')
      fail('failed-precondition','Caisse clôturée.');
    // Ne jamais prétendre vérifier matériellement un encaissement.
    const paymentStatus=method==='especes'?'declare_encaisse':'non_verifie_prestataire';
    const salesDelta=sale.prixVente;
    tx.update(drinkRef,{stockActuel:sale.nouveauStock,majLe:FieldValue.serverTimestamp()});
    tx.create(saleRef,{boissonId:pid,nomBoisson:p.data().nom,quantite:1,
      codeBarres:code,serveurUid:uid,dateVente:FieldValue.serverTimestamp(),
      caisseId:V.dayId(),scanOperationId:op,modePaiementDeclare:method,
      statutPaiement:paymentStatus,prixVenteUnitaire:sale.prixVente,
      coutAchatUnitaire:sale.prixAchat,beneficeBrut:sale.beneficeBrut,
      statut:'enregistree'});
    tx.create(stockRef,{boissonId:pid,quantiteSignee:-1,type:'vente',
      effectueParUid:uid,referenceOperation:op,creeLe:FieldValue.serverTimestamp()});
    if(cash.exists){
      tx.update(cashRef,{totalVentesDeclarees:FieldValue.increment(salesDelta),
        totalEspecesDeclarees:FieldValue.increment(method==='especes'?salesDelta:0),
        totalNumeriqueNonVerifie:FieldValue.increment(method!=='especes'?salesDelta:0)});
    }else{
      tx.create(cashRef,{jourLocal:V.dayId(),statut:'ouverte',
        totalVentesDeclarees:salesDelta,
        totalEspecesDeclarees:method==='especes'?salesDelta:0,
        totalNumeriqueNonVerifie:method!=='especes'?salesDelta:0,
        creeLe:FieldValue.serverTimestamp()});
    }
    receipt={operationId:op,boisson:p.data().nom,prix:sale.prixVente,
      marge:sale.beneficeBrut,stockRestant:sale.nouveauStock,duplicata:false,
      statutPaiement:paymentStatus};
  });
  return receipt;
});

exports.recordExpense=onCall(callOptions,async req=>{
  const uid=requireAuth(req),tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const label=checkInput(()=>V.requiredText(value(req,'libelle'),'Libellé',120));
  const expense=checkInput(()=>V.amount(value(req,'montant'),'Montant'));
  const ref=db.collection('maquis').doc(tenant).collection('depenses').doc();
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire','gerant']);
    tx.create(ref,{libelle:label,montant:expense,dateDepense:FieldValue.serverTimestamp(),saisiParUid:uid});
  });
  return {id:ref.id,montant:expense};
});

exports.recordInventory=onCall(callOptions,async req=>{
  const uid=requireAuth(req),tenant=checkInput(()=>V.requiredId(value(req,'maquisId'),'ID maquis'));
  const period=value(req,'periodeType');
  if(!['jour','semaine','mois'].includes(period))fail('invalid-argument','Période invalide.');
  const counts=value(req,'comptages');
  if(!counts||typeof counts!=='object'||Array.isArray(counts)||Object.keys(counts).length>100||Object.keys(counts).length===0)
    fail('invalid-argument','Comptage invalide.');
  const rows=Object.entries(counts).map(([pid,qty])=>({
    pid:checkInput(()=>V.requiredId(pid,'Boisson')),
    qty:checkInput(()=>V.amount(qty,'Quantité',{zero:true})),
  }));
  const root=db.doc('maquis/'+tenant),ref=root.collection('inventaires').doc();
  await db.runTransaction(async tx=>{
    await checkTenant(tx,tenant,uid,['proprietaire','gerant']);
    const docs=await Promise.all(rows.map(row=>tx.get(root.collection('boissons').doc(row.pid))));
    const lines=docs.map((d,i)=>{
      if(!d.exists)fail('not-found','Boisson absente.');
      return {boissonId:rows[i].pid,nom:d.data().nom,stockTheorique:d.data().stockActuel,
        stockCompte:rows[i].qty,ecart:rows[i].qty-d.data().stockActuel};
    });
    tx.create(ref,{periodeType:period,creeLe:FieldValue.serverTimestamp(),
      realiseParUid:uid,statut:'valide',lignes:lines});
  });
  return {id:ref.id,periodeType:period};
});
