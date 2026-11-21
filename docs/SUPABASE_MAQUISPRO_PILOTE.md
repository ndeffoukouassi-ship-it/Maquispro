# MaquisPro IGC — Projet Supabase autonome (pilote)

## Statut (21 novembre 2026)
**Préparé dans GitHub, PAS EN PRODUCTION.** Le site MaquisPro sur Render continue à fonctionner comme démonstration locale. Le pilote Firebase n'est pas utilisé pour les ventes.

**Organisation Supabase connectée** : \`ndeffoukouassi@gmail.com's Org\`, formule **Pro**, contient déjà E-PROF et IGC AutoWash.
**Devis obtenu via Supabase** pour **un nouveau projet indépendant** : **10 USD / mois récurrents**, hors dépassements d'usage. L'autorisation générale « passer sur Supabase » ne vaut pas accord à ce surcoût. Aucun troisième projet n'a été créé.
**Ne pas** ajouter des tables dans E-PROF ou IGC AutoWash, ne pas déployer ce SQL dans ces projets.

## Ce qui est préparé
- \`web-supabase/\` : interface web indépendante en vert, or et bleu clair, logo MaquisPro, comptes Gérant / Serveur, scanner EAN, catalogue de boissons, exports XLSX/DOCX, inventaires, caisse, dépenses, abonnements IGC.
- \`supabase/maquispro_schema_draft.sql\` : **script SQL de travail non appliqué**, conçu pour une base PostgreSQL Supabase neuve ; accès multi-établissement via RLS.
- \`tests/supabase-smoke-check.sql\` : scénario local avec une Castel, achat 550 F, vente 650 F, 24 bouteilles -> 23, caisse +650, marge 100 F, retry sans doublon, serveur sans accès aux coûts d'achat ni à la caisse.
- \`.github/workflows/supabase-pilot-ci.yml\` : vérifie le frontend avec Vite et exécute ces tests sur PostgreSQL 17 local.
- Aucune clé Supabase privée ou \`service_role\` n'est incluse dans le code source.

## Structure de gestion
- Un **seul projet Supabase dédié à MaquisPro** pour 100 maquis (ou davantage sous contrôle de capacité).
- Chaque établissement possède un \`maquis_id\` UUID ; tables \`mp_maquis\`, \`mp_membres\`, \`mp_boissons\`, \`mp_ventes\`, \`mp_caisse\`, \`mp_mouvements\`, \`mp_depenses\`, \`mp_inventaires\`.
- Rôles : IGC admin, propriétaire, gérant, serveur.
- Statuts : en_attente, actif, expire, suspendu.
- Tarifs IGC : installation unique **10 000 F CFA** ; mensuel **10 000 F CFA** ; annuel **100 000 F CFA**. Le paiement est contrôlé par IGC ; pas d'intégration Wave directe dans ce pilote.
- Le serveur voit les boissons, les stocks et ses ventes, sans voir les prix d'achat des boissons ni les chiffres de caisse générale.
- Le gérant voit la caisse centrale, ses employés autorisés, les coûts et les exports de son seul maquis.
- Le scan n'est valide que si la licence est active et le code-barres figure dans le catalogue du maquis.

## Sécurité : points à respecter
1. Dans les schémas exposés, **RLS activé sur toutes les tables**, sans permission d'écriture directe pour \`authenticated\` ou \`anon\`.
2. Toutes les opérations financières se font via des fonctions PostgreSQL \`SECURITY DEFINER\` dont les privilèges EXECUTE sont limités à \`authenticated\`, avec vérification explicite de \`auth.uid()\` et du rôle.
3. Ne jamais accorder les privilèges IGC à partir des métadonnées d'utilisateur modifiables par le client. L'utilisateur administrateur doit être enregistré par une session SQL privilégiée dans \`mp_igc_admins\` **après création du compte Supabase Auth**.
4. Ne pas déployer de fonction ou table sans revue des résultats CI, de la sécurité RLS et des alertes d'audit Supabase.
5. Les paiements mobiles sont **déclarés mais non vérifiés** sans une API du prestataire ; le scan ne remplace pas un reçu ni le contrôle physique de la caisse.
6. Configurer domaine Render autorisé dans Supabase Auth / URL Configuration et HTTPS ; protéger les environnements de build.
7. Toujours servir au frontend une **clé publishable** \`sb_publishable_...\` ; **jamais** une clé \`service_role\`, un secret ou le mot de passe DB.

## Mise en service, uniquement après accord sur le coût
1. **Accord explicite** de l'utilisateur sur l'ajout d'un **troisième projet Supabase à 10 USD par mois**.
2. Créer un projet dédié \`MaquisPro\` dans l'organisation existante, région \`eu-west-3\` comme les autres projets ou région adaptée après évaluation. Le projet doit être \`ACTIVE_HEALTHY\`.
3. Créer un compte administrateur IGC dans Supabase Auth avec mot de passe personnel non transmis à ChatGPT.
4. Sur le projet **MaquisPro uniquement**, inspecter la base neuve. Après revue des tests, déployer le schéma SQL ; vérifier RLS et tests d'isolation.
5. En SQL privilégié, attribuer le droit IGC à l'UID du compte administrateur par une insertion dans \`public.mp_igc_admins\`.
6. Déployer sur un nouveau site statique Render, branche \`supabase-multi-maquis\`, dossier \`web-supabase\` :
   - Build command : \`cd web-supabase && npm install --no-audit --no-fund && npm run build\`
   - Publish path : \`web-supabase/dist\`
   - \`SKIP_INSTALL_DEPS=true\`
   - \`VITE_SUPABASE_URL\` : URL publique du projet dédié
   - \`VITE_SUPABASE_PUBLISHABLE_KEY\` : clé publique du projet dédié
   - \`VITE_MAQUISPRO_BACKEND_READY=true\` : **seulement après** tests du schéma, autorisations et ventes complètes
7. Ouvrir un maquis pilote, créer 2 serveurs et 1 gérant ; simuler les ventes dans un espace dédié et vérifier les données sur plusieurs appareils.
8. Vérifier compteurs, expirations, volumes, sauvegardes et support avant la commercialisation.

## Observations
- Ces codes sont une **première version pilote** à contrôler, pas une certification ou un audit.
- Le formulaire IGC confirme manuellement le paiement avant activation ; l'automatisation Wave / Mobile Money reste à construire.
- Le tableau de bord affiche les chiffres du jour, avec revue future des rapports mensuels et annuels.
- Les fichiers Excel/Word sont générés dans le navigateur et ne sont pas transférés à un tiers.
- Le frontend affiche un message d'attente si \`VITE_MAQUISPRO_BACKEND_READY\` n'est pas \`true\`.

Aucune dépense nouvelle ni déploiement de base réelle ne doit être engagé sans consentement et validation.
