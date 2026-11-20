import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-maquispro',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, owner] of [['a', 'owner-a'], ['b', 'owner-b']]) {
      await setDoc(doc(db, 'maquis', id), {
        nom: 'Maquis ' + id, telephone: '0102030405', ville: 'Bouaké',
        adresse: 'Centre', statut: 'actif', proprietaireUid: owner,
        dateActivation: null,
      });
      await setDoc(doc(db, 'maquis', id, 'membres', owner), {
        role: 'proprietaire', actif: true,
      });
      await setDoc(doc(db, 'maquis', id, 'boissons', 'castel'), {
        nom: 'Castel 65 cl', stockActuel: 24, prixAchat: 550, prixVente: 650,
      });
      await setDoc(doc(db, 'maquis', id, 'caisse', '2026-11-20'), {
        totalVentesDeclarees: 650,
      });
    }
    await setDoc(doc(db, 'maquis', 'a', 'membres', 'server-a'), {
      role: 'serveur', actif: true,
    });
    await setDoc(doc(db, 'maquis', 'a', 'membres', 'manager-a'), {
      role: 'gerant', actif: true,
    });
    await setDoc(doc(db, 'maquis', 'a', 'ventes', 'sale-1'), {
      serveurUid: 'server-a', prixVenteUnitaire: 650,
    });
    await setDoc(doc(db, 'maquis', 'a', 'ventes', 'sale-2'), {
      serveurUid: 'another-server', prixVenteUnitaire: 650,
    });
    await setDoc(doc(db, 'maquis', 'pending'), {
      nom: 'En attente', statut: 'en_attente',
    });
    await setDoc(doc(db, 'maquis', 'pending', 'membres', 'pending-owner'), {
      role: 'proprietaire', actif: true,
    });
    await setDoc(doc(db, 'maquis', 'pending', 'boissons', 'castel'), {stockActuel: 2});
  });
});

test('le propriétaire lit son maquis et pas celui du voisin', async () => {
  const db = env.authenticatedContext('owner-a').firestore();
  await assertSucceeds(getDoc(doc(db, 'maquis', 'a')));
  await assertFails(getDoc(doc(db, 'maquis', 'b')));
  await assertSucceeds(getDoc(doc(db, 'maquis', 'a', 'boissons', 'castel')));
  await assertFails(getDoc(doc(db, 'maquis', 'b', 'boissons', 'castel')));
});

test('un serveur lit ses boissons et sa vente, pas la caisse ni une vente tierce', async () => {
  const db = env.authenticatedContext('server-a').firestore();
  await assertSucceeds(getDoc(doc(db, 'maquis', 'a', 'boissons', 'castel')));
  await assertSucceeds(getDoc(doc(db, 'maquis', 'a', 'ventes', 'sale-1')));
  await assertFails(getDoc(doc(db, 'maquis', 'a', 'ventes', 'sale-2')));
  await assertFails(getDoc(doc(db, 'maquis', 'a', 'caisse', '2026-11-20')));
});

test('aucun client ne peut modifier stock, caisse, ventes ou membres', async () => {
  const manager = env.authenticatedContext('manager-a').firestore();
  const server = env.authenticatedContext('server-a').firestore();
  await assertFails(updateDoc(doc(manager, 'maquis', 'a', 'boissons', 'castel'), {stockActuel: 100}));
  await assertFails(setDoc(doc(server, 'maquis', 'a', 'ventes', 'sale-nouvelle'), {
    serveurUid:'server-a',prixVenteUnitaire:99999,
  }));
  await assertFails(updateDoc(doc(manager, 'maquis', 'a', 'caisse', '2026-11-20'), {totalVentesDeclarees: 0}));
  await assertFails(setDoc(doc(manager, 'maquis', 'a', 'membres', 'hacker'), {role:'proprietaire',actif:true}));
  await assertFails(deleteDoc(doc(manager,'maquis','a','boissons','castel')));
});

test('seul le propriétaire modifie les coordonnées, jamais la date d activation', async () => {
  const owner = env.authenticatedContext('owner-a').firestore();
  const manager = env.authenticatedContext('manager-a').firestore();
  await assertSucceeds(updateDoc(doc(owner, 'maquis', 'a'), {nom:'Nouveau nom'}));
  await assertFails(updateDoc(doc(owner, 'maquis', 'a'), {dateActivation: new Date()}));
  await assertFails(updateDoc(doc(manager, 'maquis', 'a'), {nom:'Intrusion'}));
});

test('pas de lecture anonyme ou sans appartenance', async () => {
  const anon = env.unauthenticatedContext().firestore();
  const outsider = env.authenticatedContext('outsider').firestore();
  await assertFails(getDoc(doc(anon, 'maquis', 'a')));
  await assertFails(getDoc(doc(outsider, 'maquis', 'a')));
});

test('maquis non activé : fiche lisible mais ventes et boissons inaccessibles', async () => {
  const pending = env.authenticatedContext('pending-owner').firestore();
  await assertSucceeds(getDoc(doc(pending, 'maquis', 'pending')));
  await assertFails(getDoc(doc(pending, 'maquis', 'pending', 'boissons', 'castel')));
});
