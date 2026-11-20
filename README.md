# MaquisPro — prototype Android de test (IGC)

Application de gestion de **boissons uniquement** : scanner une bouteille = enregistrer une vente déclarée payée, déduire le stock et calculer la marge brute.

**Attention : prototype local non connecté à Firebase.** Le vendeur encaisse puis dépose les espèces dans la caisse centrale **avant** de scanner. Le scan ne prouve pas que le paiement a eu lieu. Pour les ventes réelles et plusieurs téléphones, il faut d'abord développer et auditer la connexion Firebase, les droits, la synchronisation et les sauvegardes.

## Mise à jour : fiche d'établissement et personnalisation (20/11/2026)
- Au premier démarrage, formulaire **Nom du maquis, Propriétaire, Gérant, Téléphone, Ville, Adresse**.
- La fiche est conservée localement, modifiable depuis l'icône boutique ; date de **configuration locale** enregistrée une seule fois et préservée lors des modifications.
- Accueil / configuration : **fond bleu clair, bouteille de champagne vectorielle générique, vert et or**.
- La **date d'activation commerciale** demeure en attente : la saisie d'une fiche n'active pas une licence IGC.
- Le prototype local ne gère qu'un établissement par installation et n'offre aucune isolation sécurisée par compte utilisateur.
- Un fichier [firestore.rules](firestore.rules) prépare les droits de lecture et les interdictions d'écritures client. Il **n'est pas déployé** sur le vrai projet Firebase.
- Tests d'isolation dans [tests/firestore.rules.test.mjs](tests/firestore.rules.test.mjs) exécutables avec l'émulateur Firebase. Aucun backend de vente transactionnelle multi-maquis n'est encore connecté.

## Démonstration
- Deux espaces : **Responsable** (recettes, stock, bénéfices, approvisionnements, dépenses) et **Employé** (scanner direct, historique).
- Base de données SQLite locale ; une transaction garantit que vente + décrément du stock s'effectuent ensemble.
- Données initiales : **Castel 65 cl**, achat **550 FCFA**, vente **650 FCFA**, stock **24** ; pas de code-barres attribué à Castel tant qu'il n'est pas vérifié.
- Codes-barres des autres produits : les enregistrer seulement après vérification physique.

## Générer un APK de test
Dans GitHub → **Actions** → **Construire APK MaquisPro (test)** → **Run workflow**, puis télécharger l'artifact **MaquisPro-Android-APK-test** une fois le job terminé.

Ce dépôt contient un projet Flutter sans dossier Android généré ; l'action exécute **flutter create**, les tests, puis **flutter build apk --debug**. Aucune clé Firebase ou bancaire ne doit être publiée.

## Avertissement
Ce code est destiné à la **démonstration**, sans authenticaton, synchronisation multi-serveurs ni piste d'audit inviolable. Les prix, recettes et bénéfices ne peuvent être considérés comme un système comptable de production.

## Sécurité multi-maquis : état de développement
La cible est décrite dans [docs/STRUCTURE_MULTI_MAQUIS.md](docs/STRUCTURE_MULTI_MAQUIS.md). Toutes les opérations sensibles (stock, ventes, caisse, licence, membres) sont **refusées en écriture depuis le client** par les nouvelles règles proposées. Un backend authentifié devra gérer les transactions et attribuer les rôles, avec tests avant tout déploiement. Les transactions SQLite du prototype ne synchronisent pas plusieurs téléphones.

## Mise à jour visuelle — champagne photoréaliste
La bouteille précédemment dessinée a été remplacée dans les écrans d'accueil et de configuration du maquis par une **image photoréaliste sans marque** enregistrée sous `assets/images/champagne_maquispro.jpg`. L'image est embarquée dans l'APK et fonctionne hors connexion. Le fond reste bleu clair, avec des accents verts et dorés. Cette modification visuelle ne change pas la synchronisation Firebase (toujours non connectée dans la démonstration).
