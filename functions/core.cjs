'use strict';

/**
 * Validations partagées des écritures financières MaquisPro.
 * Toutes les sommes sont des entiers positifs en francs CFA (XOF).
 */
const ID=/^[a-zA-Z0-9_-]{1,90}$/;
const EAN=/^[0-9]{8,14}$/;
const MAX_AMOUNT=1000000000;

function requiredId(value,label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(label+' invalide');
  return value;
}
function requiredText(value,label,max=100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length>max)
    throw new Error(label+' invalide');
  return value.trim();
}
function amount(value,label,{zero=false}={}) {
  if (!Number.isSafeInteger(value) || value < (zero?0:1) || value > MAX_AMOUNT)
    throw new Error(label+' invalide');
  return value;
}
function barcode(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value!=='string' || !EAN.test(value)) throw new Error('Code-barres invalide');
  return value; // Conserver zéros initiaux.
}
function checkSale(product) {
  const stock=product?.stockActuel,prix=product?.prixVente,cost=product?.prixAchat;
  amount(prix,'Prix de vente');
  amount(cost,'Prix d’achat',{zero:true});
  if (!Number.isSafeInteger(stock) || stock<1) throw new Error('Rupture de stock');
  return {prixVente:prix,prixAchat:cost,nouveauStock:stock-1,beneficeBrut:prix-cost};
}
function dayId(date=new Date()) {
  // Pour le pilote Abidjan = UTC (GMT+0, pas d'heure d'été).
  return date.toISOString().slice(0,10);
}
function validateMethod(method) {
  const allowed=['especes','wave','orange_money','mtn_money'];
  if (!allowed.includes(method)) throw new Error('Mode de paiement invalide');
  return method;
}
module.exports={requiredId,requiredText,amount,barcode,checkSale,dayId,validateMethod};
