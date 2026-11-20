# MaquisPro — Structure fonctionnelle et technique multi-maquis
**Projet IGC | Spécification V1, 20 novembre 2026**  
**Statut : conception.** Ce fichier définit la structure cible; **elle n'est pas encore implémentée dans l'APK local**.

## 1. Principes validés
- Une seule marque d'application : MaquisPro, commercialisable auprès de plusieurs maquis.
- Chaque maquis saisit son propre **nom**, son adresse, ses contacts et éventuellement son logo au moment de son inscription / activation.
- Les informations de **chaque maquis sont strictement séparées** : utilisateurs, stocks, caisse, ventes, prix, dépenses, bénéfices, inventaires et licence.
- Chaque maquis dispose de **sa caisse centrale unique**, avec traçabilité des vendeurs.
- **Boissons seulement**, jamais de restauration.
- Le client paie le serveur; le serveur dépose immédiatement l'argent dans la caisse centrale; il scanne ensuite la boisson. Un scan reconnu **déclare une unité vendue** et met à jour vente, stock et marge brute en une seule opération atomique, sans validation du responsable.
- Un scan ne peut pas prouver un paiement en espèces ni un dépôt physique à la caisse. Des rapprochements de caisse sont nécessaires.
- Fond de connexion / accueil : bouteille de champagne sur fond bleu clair, éléments de marque vert émeraude et or. Le nom du maquis reste paramétrable. Image sous licence adaptée à une exploitation commerciale.
- Dates et périodes selon le fuseau **Africa/Abidjan**; conserver les timestamps en UTC.

## 2. Espaces et autorisations
| Rôle | Fonctionnalités |
|---|---|
| **Administrateur IGC** | Activer/suspendre les établissements et administrer la plateforme, sans accès par défaut aux détails financiers sauf nécessité contractuelle explicitement autorisée |
| **Propriétaire** | Paramètres du maquis, gérant et serveurs, ventes, stocks, caisse, inventaires, dépenses, bénéfices, rapports, licence |
| **Gérant** | Ventes, approvisionnements, inventaires, caisse, dépenses, rapports; droits de configuration selon autorisation du propriétaire |
| **Serveur** | Scanner et enregistrer des ventes, lire les produits et son propre historique; ne peut ni modifier prix ni supprimer une vente |

**Important :** le prototype actuel présente les deux écrans sans connexion. Ne pas l'utiliser en production tant que l'authentification et les droits ne sont pas actifs.

## 3. Structure Cloud Firestore (cible)
```text
users/{uid}                          // identité et liens d'accès
maquis/{maquisId}                    // fiche établissement
  configuration/generale            // préférences visuelles, fonds et règles
  licence/actuelle                  // statut d'activation
  membres/{uid}                     // rôle attribué dans ce maquis
  boissons/{boissonId}              // catalogue, prix, stock courant
  fournisseurs/{fournisseurId}
  entrees_stock/{entreeId}          // approvisionnements
  mouvements_stock/{mouvementId}    // journal append-only
  ventes/{venteId}                  // vente après scan
  caisse/{jourId}                   // caisse centrale et rapprochement
  depenses/{depenseId}
  inventaires/{inventaireId}        // décomptes physiques périodiques
  rapports/{rapportId}              // agrégats calculés / snapshots
```
Utiliser des identifiants opaques pour `maquisId`, `boissonId`, `venteId` etc. L'accès client est toujours filtré par le `maquisId` de l'utilisateur autorisé et contrôlé **côté serveur**.

### 3.1 `maquis/{maquisId}`
| Champ | Type | Rôle |
|---|---|---|
| `nom` | string | Nom saisi par le client; jamais fixe |
| `telephone` | string | Téléphone du maquis |
| `adresse` | string | Adresse descriptive |
| `ville` | string | Ville / commune |
| `proprietaireUid` | string | Référence au propriétaire |
| `gerantUid` | string ou null | Référence au gérant |
| `logoUrl` | string ou null | Logo facultatif |
| `statut` | string | en_attente / actif / suspendu / ferme |
| `creeLe` | timestamp | Date de création serveur |
| `dateActivation` | timestamp ou null | Première activation enregistrée par serveur, immuable |
| `dateDebutExploitation` | timestamp ou null | Date de lancement opérationnel distincte |
| `devise` | string | XOF |
| `fuseauHoraire` | string | Africa/Abidjan |

### 3.2 `maquis/{maquisId}/licence/actuelle`
`plan` (string, sans tarif présumé), `statut` (en_attente/actif/expire/suspendu), `activeLe` (timestamp serveur), `expireLe` (timestamp ou null), `renouveleLe` (timestamp ou null), `referencePaiement` (string ou null), `historique` (référence vers journal d'événements).
La licence / date d'activation n'est **pas modifiable par le serveur ni le gérant**. Toute modification de licence est gérée côté administration IGC.

### 3.3 `maquis/{maquisId}/membres/{uid}`
`uid`, `nomAffiche`, `telephone`, `role` (proprietaire/gerant/serveur), `actif` (bool), `ajouteLe` (timestamp), `ajoutePar` (uid).
Authentification Firebase Auth; `users/{uid}` stocke un profil minimal (sans secrets ou mot de passe).

### 3.4 `maquis/{maquisId}/boissons/{boissonId}`
| Champ | Type | Exemple |
|---|---|---|
| `nom` | string | Castel 65 cl |
| `marque` | string | Castel |
| `categorie` | string | Bière |
| `volumeMl` | integer | 650 |
| `codeBarres` | string ou null | **Code vérifié sur la vraie bouteille**, pas un numéro supposé |
| `prixAchat` | integer | 550 |
| `prixVente` | integer | 650 |
| `stockActuel` | integer | 24 |
| `seuilAlerte` | integer | 5 (modifiable) |
| `actif` | bool | true |
| `photoUrl` | string ou null | Image facultative |
| `majLe` | timestamp | Dernière modification |

`codeBarres` doit rester une chaîne, y compris les zéros initiaux. S'assurer de son unicité **par maquis et par variante**, sous contrôle serveur. Plusieurs bouteilles identiques partagent généralement le même code EAN.

### 3.5 `fournisseurs/{id}` et `entrees_stock/{id}`
Fournisseur : `nom`, `contact`, `adresse`, `actif`.
Entrée : `boissonId`, `quantite`, `coutUnitaire`, `totalAchat`, `fournisseurId`, `referenceFacture`, `recuParUid`, `creeLe`.
Chaque entrée produit **dans une transaction** un mouvement de stock positif. Le prix d'achat historique de chaque lot doit être conservé pour une comptabilité plus exacte (FIFO ou coût moyen à choisir lors de l'implémentation).

### 3.6 `ventes/{venteId}`
`boissonId`, `nomBoisson`, `codeBarres`, `quantite=1`, `prixVenteUnitaire` (snapshot), `coutAchatUnitaire` (snapshot), `beneficeBrut`, `serveurUid`, `dateVente` (timestamp serveur), `modePaiementDeclare` (especes / wave / orange_money / mtn_money / autre), `statutPaiement` (declare_encaisse / confirme_prestataire), `caisseId`, `scanOperationId` (unique), `statut` (enregistree / annulee_par_correction).
- **Pas de ventes à crédit**.
- Un scan réussi = vente atomique + stock −1 + montant de caisse attendu + marge brute.
- Codes inconnus ou stock nul = vente rejetée, sans écriture.
- Plusieurs lectures très rapprochées d'un même code peuvent venir d'une seule bouteille : bloquer les doublons techniques **par scanOperationId** et fermer/verrouiller le scanner après succès, tout en permettant une nouvelle vente volontaire d'une autre bouteille identique.
- Ne jamais autoriser la suppression ou la réécriture client d'une vente ; rectifier par opération compensatoire traçable.

### 3.7 `mouvements_stock/{id}`
`boissonId`, `type` (approvisionnement/vente/retour/perte/inventaire_ajustement), `quantiteSignee`, `referenceOperation`, `effectueParUid`, `creeLe`, `motif`.
**Stock théorique à tout instant = stock initial + approvisionnements + retours − ventes − pertes ± ajustements**, calculé à partir des mouvements. Stock courant est un cache transactionnel, toujours réconciliable.

### 3.8 `caisse/{jourId}` : **une seule caisse par maquis**
`jourLocal` (YYYY-MM-DD), `soldeOuverture`, `totalVentesDeclarees`, `totalEspecesDeclarees`, `totalPaiementsNumeriquesConfirmes`, `especesCompteFinJour`, `ecartCaisse`, `clotureParUid`, `clotureLe`, `statut` (ouverte/cloturee). Les paiements mobiles déclarés et les paiements confirmés par prestataire ne doivent pas être confondus. La caisse unique n'empêche pas l'attribution de chaque vente au serveur.

### 3.9 `depenses/{depenseId}`
`libelle`, `categorie` (transport/electricite/salaire/loyer/autre), `montant` (integer FCFA), `dateDepense`, `saisiParUid`, `justificatifUrl` facultatif, `statut`.

### 3.10 `inventaires/{inventaireId}`
`periodeType` (jour/semaine/mois), `debutLocal`, `finLocal`, `statut` (brouillon/valide), `realiseParUid`, `valideParUid`, `creeLe`, `lignes` ou sous-collection des lignes.
Chaque **ligne par boisson** : `boissonId`, `stockOuverture`, `entrees`, `sortiesVentes`, `sortiesAutres`, `stockTheorique`, `stockCompte`, `ecart`, `valeurStock`, `chiffreAffaires`, `coutVendu`, `beneficeBrut`.
`ecart = stockCompte − stockTheorique`. L'inventaire mensuel / hebdomadaire doit agréger les mouvements (éviter d'additionner deux fois les stocks de fin de journée).
Les inventaires validés restent conservés en historique ; corrections par mouvements tracés.

### 3.11 `rapports/{id}`
`periodeType`, `debutLocal`, `finLocal`, `ca`, `coutBoissonsVendues`, `beneficeBrut`, `charges`, `beneficeNetEstime`, `nbBoissonsVendues`, `classementBoissons`, `genereLe`.
**Bénéfice brut = chiffre d'affaires − coût des boissons vendues.**
**Bénéfice net estimé = bénéfice brut − charges imputées à la période.**
Ne pas confondre achats de nouveaux stocks avec charges du résultat : utiliser coût des boissons réellement vendues pour éviter les doubles déductions.

## 4. Écrans
### A. Administration IGC
Liste des maquis, créations, activations/suspensions, licences et échéances, état technique des établissements. Aucun mélange des données financières des clients.

### B. Activation du client
Nom du maquis, propriétaire, gérant (optionnel), téléphone, commune/adresse, logo (optionnel), statut de licence, date d'activation écrite côté serveur. Ne pas imposer un nom de maquis dans le code.

### C. Propriétaire / Gérant
- Accueil : nom du maquis, **date d'activation**, recettes de la caisse unique, nombre de bouteilles vendues, bénéfice brut, bénéfice net estimé, alertes.
- Stock par boisson : recherche, photo, code-barres, prix achat/vente, quantité, seuil, historique.
- Approvisionnements : entrée par boisson et fournisseur, justificatif.
- Inventaire **journalier**, **hebdomadaire**, **mensuel** : stock théorique, stock compté, écart, mouvements et signature/validation.
- Ventes & caisse : toutes les ventes, attribution aux serveurs, rapprochement et clôture.
- Bénéfices : par boisson/période, dépenses, classement des boissons les plus rentables.
- Paramètres du maquis : personnalisation sans toucher aux autres maquis.

### D. Employé
Scanner caméra au premier plan ; identification boisson/prix ; confirmation automatique de la vente déclarée payée ; son et retour visuel ; historique du serveur ; affichage de rupture.
L'employé **ne peut pas** modifier stock/prix, la caisse, ni les inventaires validés.

## 5. Sécurité, cohérence et données
1. Utiliser **Firebase Authentication** et des **règles Firestore multi-locataires** vérifiées par tests : accès explicite au `maquisId` autorisé uniquement.
2. Les ventes, déductions de stock et cumuls de caisse passent par **une opération serveur transactionnelle**, pas par trois écritures indépendantes du mobile.
3. Un identifiant d'opération empêche les soumissions réseau répétées ; autoriser un nouvel acte de scan volontaire de la même référence.
4. Prix d'achat/vente et stock modifiables uniquement par rôle autorisé ; les employés ne peuvent pas fabriquer de ventes à prix arbitraire.
5. Prévoir sauvegardes, restauration, pistes d'audit, politiques de conservation, correction des erreurs et passage hors ligne contrôlé. **Ne pas confirmer une vente hors ligne comme synchronisée** tant que le serveur ne l'a pas acceptée.
6. Enregistrer dates d'activation, clôtures et paiements administratifs sur horodatage serveur ; protéger contre l'édition depuis le téléphone.
7. Tester le fonctionnement concurrent : deux serveurs peuvent scanner simultanément la dernière bouteille, **un seul** doit réussir.

## 6. Exemple de deux clients différents
- Maquis A → `maquis/a123/boissons/castel` : prix 650, stock 24, caisse A
- Maquis B → `maquis/b456/boissons/castel` : prix 700, stock 48, caisse B
Même application et même code Flutter, mais aucun partage des stocks, prix ou recettes.

## 7. Prochaines réalisations techniques (non encore faites)
1. Créer la fiche maquis, l'enrôlement et la date d'activation.
2. Mettre en place Firebase Auth + rôles + isolation testée entre maquis.
3. Migrer le catalogue du prototype SQLite vers Firestore, en évitant d'assigner un code-barres non vérifié à Castel.
4. Implémenter la transaction serveur de scan et les mouvements de stock.
5. Ajouter inventaire jour/semaine/mois, comptage physique et écarts.
6. Ajouter rapprochement de caisse, dépenses, profits, rapports et export.
7. Appliquer la nouvelle identité visuelle : bleu clair + vert/or + bouteille de champagne générique.
8. Faire des tests fonctionnels sur Android puis préparer une version de distribution signée.

## 8. Notes commerciales
Le **prix de vente de la licence, la durée d'essai et les conditions de renouvellement sont à définir**. Ne pas coder de tarif sans décision explicite d'IGC.
