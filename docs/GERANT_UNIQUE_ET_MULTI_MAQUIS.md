# MaquisPro — Propriétaire de plusieurs maquis et un gérant par maquis

## Règle décidée par IGC (22 novembre 2026)
- Un propriétaire peut posséder plusieurs établissements.
- **Un seul gérant actif par maquis**.
- **Un compte gérant ne peut gérer qu'un seul maquis à la fois**.
- Chaque gérant possède uniquement les droits sur son établissement ; pas d'accès aux autres stocks, ventes ni caisses.
- Chaque établissement conserve sa caisse centrale unique, son inventaire et sa licence.
- Le propriétaire peut retirer l'ancien gérant avant d'en inviter un nouveau.

## Parcours propriétaire
1. Se connecter dans MaquisPro et ouvrir **Mes maquis**.
2. Choisir l'établissement concerné.
3. Ouvrir **Équipe → Gérant de ce maquis**.
4. Saisir l'adresse e-mail personnelle du gérant et cliquer sur **Créer son lien d'invitation**.
5. Copier le lien personnel et le partager exclusivement avec le gérant (WhatsApp ou autre canal).
6. Le lien expire 48 heures après sa création et ne peut servir qu'une fois.
7. Pour remplacer un gérant, cliquer sur **Retirer l'accès du gérant**, puis créer un nouveau lien.

## Parcours gérant sans mot de passe
1. Ouvrir le lien reçu.
2. Saisir **exactement l'adresse e-mail invitée**.
3. Cliquer sur **Recevoir mon code de connexion**.
4. Saisir le **code OTP à six chiffres** reçu par e-mail ; ou, si le modèle d'e-mail Supabase reste en mode Magic Link, ouvrir le lien d'authentification reçu à la place.
5. Cliquer sur **Accepter l'invitation et ouvrir mon maquis**.
6. Une session authentifiée est créée ; un mot de passe n'est pas nécessaire.

**Configuration requise pour le code à six chiffres :** dans le projet Supabase dédié à MaquisPro, le modèle d'e-mail **Magic Link / OTP** doit contenir la variable de template `{{ .Token }}` (au lieu de n'afficher qu'un lien `{{ .ConfirmationURL }}`). Sans cette configuration, Supabase envoie normalement un Magic Link, qui permet aussi une connexion sans mot de passe. Le format du message n'est pas modifiable depuis le seul code du site statique.

**Également requis avant commercialisation :** configurer un SMTP fiable, les URLs de redirection autorisées, les quotas e-mails, la politique de renouvellement et réaliser un essai réel de bout en bout sur le téléphone du gérant. La configuration SMTP par défaut de Supabase peut limiter fortement les envois. Ne jamais diffuser un code OTP à quelqu'un d'autre.

## Contrôles techniques
- Table `mp_invitations_gerant` : lien aléatoire à 256 bits, jeton **haché** en base, lié à un e-mail et à un seul maquis.
- Le jeton doit être inutilisé, non annulé et non expiré.
- L'acceptation exige une **session Supabase Auth valide** dont l'e-mail est confirmé et identique à l'e-mail invité.
- Index partiel unique sur `mp_membres(maquis_id)` pour empêcher deux gérants actifs du même maquis.
- Index partiel unique sur `mp_membres(user_id)` pour empêcher un gérant actif sur plusieurs maquis.
- La révocation rend immédiatement le droit inactif dans les contrôles côté serveur.
- Les fonctions SQL effectuent les contrôles de droits avec `auth.uid()` ; la table des invitations n'est pas directement lisible par les clients.
- Les tests PostgreSQL simulés sont dans `tests/supabase-manager-invitations.sql` et tournent dans la CI GitHub.

## Limites actuelles
- Il s'agit d'une fonctionnalité du **pilote MaquisPro**, pas d'une commercialisation validée.
- Les **ventes réelles restent verrouillées** par `mp_parametres_igc.ventes_actives=false`.
- Aucun e-mail ou invitation réelle de gérant n'a été envoyé pendant la mise en place du code ; les tests utilisent des identités fictives.
- Avant l'usage effectif d'un code à six chiffres, il faut vérifier la configuration du template e-mail Supabase et son fonctionnement.
