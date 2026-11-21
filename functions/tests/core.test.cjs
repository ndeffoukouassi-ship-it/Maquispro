'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../core.cjs');

test('Castel : 650-550 = 100, 24 bouteilles deviennent 23',()=>{
 const sale=V.checkSale({stockActuel:24,prixVente:650,prixAchat:550});
 assert.deepEqual(sale,{prixVente:650,prixAchat:550,nouveauStock:23,beneficeBrut:100});
});
test('Rupture de stock : aucune vente autorisée',()=>{
 assert.throws(()=>V.checkSale({stockActuel:0,prixVente:650,prixAchat:550}),/Rupture/);
});
test('Code-barres entier numérique conservé comme chaîne, y compris zéros',()=>{
 assert.equal(V.barcode('0001234567890'),'0001234567890');
 assert.throws(()=>V.barcode(12345678),/invalide/);
 assert.throws(()=>V.barcode('123'),/invalide/);
});
test('Un montant fractionnaire, négatif ou incohérent est refusé',()=>{
 assert.throws(()=>V.amount(1.5,'prix'),/invalide/);
 assert.throws(()=>V.amount(-1,'prix'),/invalide/);
 assert.throws(()=>V.amount('650','prix'),/invalide/);
});
test('Id d’opération valide et date Abidjan GMT',()=>{
 assert.equal(V.requiredId('scan-3456','ID'),'scan-3456');
 assert.throws(()=>V.requiredId('path/traversal','ID'),/invalide/);
 assert.equal(V.dayId(new Date('2026-11-21T23:55:00Z')),'2026-11-21');
});
test('Paiement : seules les méthodes déclarées sont admises',()=>{
 assert.equal(V.validateMethod('especes'),'especes');
 assert.throws(()=>V.validateMethod('credit'),/invalide/);
});
