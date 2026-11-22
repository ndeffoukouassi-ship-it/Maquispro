// Fonctions pures du tableau de bord commercial IGC.
// Les chiffres affichés sont des montants de tarifs, jamais des paiements confirmés.
export const TARIFS_IGC=Object.freeze({installation:10000,mensuel:10000,annuel:100000});
const DAY=86400000;
export function licenceInfo(maquis,now=new Date()){
  const status=String(maquis?.statut||'en_attente');
  if(status==='suspendu')return {key:'suspendu',label:'Suspendu',days:null};
  if(status==='en_attente')return {key:'en_attente',label:'En attente',days:null};
  if(status==='expire')return {key:'expire',label:'Expiré',days:null};
  if(status!=='actif')return {key:'inconnu',label:'À vérifier',days:null};
  const expiry=maquis?.expire_le?Date.parse(maquis.expire_le):NaN;
  if(!Number.isFinite(expiry))return {key:'inconnu',label:'Expiration à vérifier',days:null};
  // Horloge locale Abidjan : UTC+0, sans changement d'heure.
  const dayNow=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const d=new Date(expiry);
  const dayExpiration=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  const days=Math.round((dayExpiration-dayNow)/DAY);
  if(days<0)return {key:'expire',label:'Expiré',days};
  if(days<=15)return {key:'bientot',label:'À renouveler',days};
  return {key:'actif',label:'Actif',days};
}
export function resumeParc(maquis,now=new Date()){
  const rows=Array.isArray(maquis)?maquis:[];
  const details=rows.map(m=>({...m,licence:licenceInfo(m,now)}));
  return {
    total:details.length,
    actifs:details.filter(m=>m.licence.key==='actif'||m.licence.key==='bientot').length,
    aRenouveler:details.filter(m=>m.licence.key==='bientot').length,
    enAttente:details.filter(m=>m.licence.key==='en_attente').length,
    expires:details.filter(m=>m.licence.key==='expire').length,
    suspendus:details.filter(m=>m.licence.key==='suspendu').length,
    details
  };
}
export function filtrerParc(rows,search='',statut='tous',now=new Date()){
  const q=String(search||'').trim().toLocaleLowerCase('fr');
  return resumeParc(rows,now).details.filter(m=>{
    if(statut!=='tous'&&m.licence.key!==statut)return false;
    return !q||[m.nom,m.ville,m.id].some(v=>String(v||'').toLocaleLowerCase('fr').includes(q));
  }).sort((a,b)=>{
    const order={bientot:0,expire:1,en_attente:2,suspendu:3,inconnu:4,actif:5};
    const n=(order[a.licence.key]??9)-(order[b.licence.key]??9);
    if(n)return n;
    if(a.licence.days!==null&&b.licence.days!==null&&a.licence.days!==b.licence.days)
      return a.licence.days-b.licence.days;
    return String(a.nom||'').localeCompare(String(b.nom||''),'fr');
  });
}
