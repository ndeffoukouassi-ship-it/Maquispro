import test from 'node:test';
import assert from 'node:assert/strict';
import {TARIFS_IGC,licenceInfo,resumeParc,filtrerParc} from '../web-supabase/src/admin-summary.mjs';
const now=new Date('2026-11-21T12:00:00Z');
const m=(name,statut,expire_le=null)=>({id:name,nom:name,ville:'Bouaké',statut,expire_le});
test('Les tarifs commerciaux validés restent 10000/10000/100000 FCFA',()=>{
 assert.deepEqual(TARIFS_IGC,{installation:10000,mensuel:10000,annuel:100000});
});
test('Expiration proche signalée sans modifier la licence',()=>{
 assert.deepEqual(licenceInfo(m('A','actif','2026-12-01T14:00:00Z'),now),
   {key:'bientot',label:'À renouveler',days:10});
 assert.equal(licenceInfo(m('B','actif','2026-12-20T00:00:00Z'),now).key,'actif');
 assert.equal(licenceInfo(m('C','actif','2026-11-20T15:00:00Z'),now).key,'expire');
});
test('Une licence suspendue ne devient jamais active par son échéance',()=>{
 assert.equal(licenceInfo(m('D','suspendu','2027-01-01T00:00:00Z'),now).key,'suspendu');
 assert.equal(licenceInfo(m('E','en_attente'),now).key,'en_attente');
});
test('Calcul des compteurs et filtres, sans inventer de recettes encaissées',()=>{
 const rows=[m('Alpha','actif','2026-12-01T00:00:00Z'),m('Bêta','actif','2027-01-01T00:00:00Z'),
 m('Gamma','en_attente'),m('Delta','expire'),m('Epsilon','suspendu')];
 const stats=resumeParc(rows,now);
 assert.equal(stats.total,5);assert.equal(stats.actifs,2);
 assert.equal(stats.aRenouveler,1);assert.equal(stats.enAttente,1);
 assert.equal(stats.expires,1);assert.equal(stats.suspendus,1);
 assert.equal(filtrerParc(rows,'beta','tous',now).length,0);
 assert.equal(filtrerParc(rows,'bêta','tous',now).length,1);
 assert.equal(filtrerParc(rows,'','bientot',now)[0].nom,'Alpha');
});
