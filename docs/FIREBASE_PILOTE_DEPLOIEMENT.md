# MaquisPro — Passage de la démonstration au pilote Firebase connecté
**Projet IGC — document de mise en service, 21 novembre 2026**

> **Attention : le site Render public actuel reste une démonstration locale.**
> Cette branche `firebase-multi-maquis` n'est pas encore déployée sur le projet Firebase réel.
> Ne pas l'utiliser avec de vraies ventes avant les vérifications ci-dessous.

## Architecture visée

- **Frontend web** dans `web-firebase/` : authentification, espace Gérant, espace Serveur, scanner, tableaux de bord en temps réel. Render sert la page HTTPS.
- **Firebase Authentication** : chaque propriétaire, gérant et serveur possède son propre compte e-mail / mot de passe.
- **Cloud Firestore** : chaque établissement dans `maquis/{maquisId}/...`, avec catalogue, membres, ventes, mouvements, caisse, dépenses et inventaires isolés.
- **Cloud Functions v2** dans `functions/` : seules les fonctions authentifiées réalisent des écritures financières. Le scan envoie un code EAN réel ; le serveur déduit une unité et enregistre la vente et la caisse dans une transaction.
- **Règles Firestore** : les utilisateurs autorisés lisent les documents de leur maquis. Les écritures de stock, de caisse, de ventes et de rôles sont bloquées depuis les navigateurs.

## Situation Firebase connue

Le projet Firebase **MAQUIS-PRO** a été créé par l'utilisateur. Son identifiant a été vu dans ses captures comme `maquis-pro-fe5fd`. Le forfait visible était **Spark (gratuit)**. La base `(default)` avait été créée avec le document existant `boissons/castel_65cl`.

**Ne supprimer ni écraser ce document.** Le nouveau schéma par maquis est distinct de ce document historique. Une migration soigneuse du catalogue reste à planifier ; le code n'en réalise aucune automatiquement.

**Coût important :** déployer Cloud Functions nécessite **Blaze**, avec une facturation à l'usage. L'activation de Blaze doit être approuvée explicitement. Prévoir des alertes budgétaires et des limites d'instances. Le code ne peut pas activer la facturation lui-même.

## Étape A — Relier le projet Firebase (action utilisateur)

1. Connecter l'application **Firebase** à ChatGPT en choisissant le compte et le projet MAQUIS-PRO.
2. Dans Firebase Console > **Authentication** > **Sign-in method**, activer **E-mail / Mot de passe**.
3. Dans **Paramètres du projet > Vos applications**, créer ou sélectionner l'application **Web**.
4. Copier les champs publics `apiKey`, `authDomain`, `projectId` et `appId` de la configuration web. Ces champs ne sont pas une clé d'administration.
5. Dans les domaines autorisés d'Authentication, ajouter le **domaine Render du pilote connecté**, une fois créé.

**Ne pas envoyer de mots de passe, clés privées de compte de service, tokens OAuth ou fichiers JSON d'administration dans le chat ni dans GitHub.**

## Étape B — Firebase sécurisé (avant déploiement public)

1. Utiliser les règles `firestore.rules` déjà testées avec l'émulateur. Ne pas remplacer la configuration de production avant revue de toutes les données et collections existantes.
2. Examiner la séparation des accès : un serveur du maquis A doit être incapable de lire les ventes ou stocks du maquis B.
3. Dans un environnement **de confiance uniquement**, attribuer la permission `platformAdmin: true` à l'identité IGC chargée de créer et d'activer les maquis ; cette permission ne doit jamais être créée depuis le navigateur.
4. Activer Firebase App Check sur les applications Web, puis envisager l'option `enforceAppCheck: true` des fonctions après configuration et essais.
5. Activer **Blaze seulement après approbation du propriétaire** pour déployer Functions v2. Configurer un budget d'alerte.

### Fonctions prévues

| Callable | Accès | Effet |
|---|---|---|
| `createMaquis` | Administrateur plateforme IGC | Crée une fiche en attente et autorise son propriétaire |
| `activateMaquis` | Administrateur plateforme IGC | Active un établissement et horodate sa première activation |
| `addMember` | Propriétaire | Autorise un compte existant comme gérant ou serveur |
| `addDrink` | Propriétaire / gérant | Crée une référence de boisson sans stock initial |
| `stockIn` | Propriétaire / gérant | Enregistre un approvisionnement et met à jour le stock |
| `saleScan` | Propriétaire / gérant / serveur | Vente atomique, stock -1, mouvement et caisse centrale |
| `recordExpense` | Propriétaire / gérant | Dépense de la période |
| `recordInventory` | Propriétaire / gérant | Comptage physique sans correction de stock automatique |

Chaque appel vérifie le `maquisId`, le rôle du demandeur et le statut **actif**. Les opérations de vente possèdent un identifiant stable pour résister à une répétition réseau.

**Limites du premier pilote** :
- Le scan crée une **déclaration de vente payée**, pas une preuve de dépôt d'espèces. Les paiements mobiles restent marqués **non vérifiés** tant qu'aucune API bancaire n'est connectée.
- Une référence EAN est commune aux bouteilles du même produit : le scanner se ferme après une lecture réussie.
- Le coût des produits est modélisé par un **coût moyen simplifié** ; comptabilité détaillée par lot et bénéfice net fiscal demandent encore validation.
- Pas d'enregistrement de vente « réussi » hors ligne : une transaction doit être acceptée par Firebase.

## Étape C — Déploiement en pilote (après connexion)

1. Installer les dépendances Firebase Functions sous `functions/` et vérifier les tests.
2. Déployer le code de `firebase-multi-maquis` sur une **cible pilote isolée**, jamais en écrasant la démo.
3. Déployer les règles Firebase **après** les tests d'isolation. Les fonctions utilisent les droits Admin côté serveur, sans clé privée publiée.
4. Créer un site Render séparé pour le pilote connecté :
   - Repository : `ndeffoukouassi-ship-it/Maquispro`
   - Branche : `firebase-multi-maquis`
   - Build command : `cd web-firebase && npm install --no-audit --no-fund && npm run build`
   - Publish path : `web-firebase/dist`
   - Variables de build **publiques** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
5. Ajouter le nouveau domaine Render aux domaines autorisés d'Authentication.
6. Vérifier un achat test à 550 F et une vente test à 650 F, à deux téléphones, et le stock passant de 24 à 23 une seule fois.
7. Vérifier les protections de rupture, de double lecture, de maquis non actif et de séparation de clients.
8. Après acceptation commerciale, prévoir sauvegardes, supervision, RGPD/données personnelles applicable, politique de licence et facturation.

## Tests automatiques

Le workflow GitHub `.github/workflows/firebase-pilot-ci.yml` vérifie :
- syntaxe des modules ;
- tests unitaires de calcul et de validation ;
- construction du site Vite ;
- six tests de permissions Firestore avec l'émulateur.

Ces tests sont des prérequis nécessaires, **pas un audit de production**.

## Ce qui reste indispensable

Le connecteur Firebase ou la configuration Web du projet, l'approbation éventuelle du forfait Blaze, l'autorisation du domaine Render et le bootstrap administrateur IGC. Sans ces étapes, aucune application honnête ne peut être déclarée « entièrement connectée en production ».
