# MaquisPro — prototype Android de test (IGC)

Application de gestion de **boissons uniquement** : scanner une bouteille = enregistrer une vente déclarée payée, déduire le stock et calculer la marge brute.

**Attention : prototype local non connecté à Firebase.** Le vendeur encaisse puis dépose les espèces dans la caisse centrale **avant** de scanner. Le scan ne prouve pas que le paiement a eu lieu. Pour les ventes réelles et plusieurs téléphones, il faut d'abord développer et auditer la connexion Firebase, les droits, la synchronisation et les sauvegardes.

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
