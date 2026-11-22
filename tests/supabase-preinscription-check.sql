\set ON_ERROR_STOP on
-- Test local du dossier pilote avant création du compte propriétaire.
-- Une préinscription ne crée ni maquis commercial, ni rôle, ni licence.
select count(*)::int as tenants_before from public.mp_maquis \gset
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.mp_preinscrire_maquis('Maquis Buzz VIP','Bouaké','Nimbo Fromager','+225 01 51 01 22 87') as dossier_id \gset
select count(*)::int as dossiers from public.mp_lister_preinscriptions() \gset
select public.test_assert(:dossiers::int=1,'IGC voit la préinscription');

-- Ne pas exposer directement les données des dossiers.
do $$
declare blocked boolean:=false;
begin
  begin
    perform * from public.mp_preinscriptions limit 1;
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'Test: accès direct non autorisé aux dossiers';end if;
end $$;

-- Un utilisateur non autorisé ne peut pas lire ou créer un dossier.
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_preinscrire_maquis('Intrus','Bouaké','','0102030405');
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: un non-administrateur a créé un dossier';end if;
end $$;
do $$
declare blocked boolean:=false;
begin
  begin
    perform * from public.mp_lister_preinscriptions();
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: un non-administrateur a lu les dossiers';end if;
end $$;
reset role;
select public.test_assert((select count(*) from public.mp_maquis)=:tenants_before::int,
  'Une préinscription ne crée pas de maquis commercial');
select public.test_assert((select count(*) from public.mp_preinscriptions)=1,'Préinscription persistée');
-- Un compte propriétaire inexistant ne peut pas être utilisé pour s'attribuer le maquis.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_creer_maquis('Maquis Buzz VIP','Bouaké','+225 01 51 01 22 87','proprietaire-inconnu@igc.test');
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: creation attribuee a une fausse proprietaire';end if;
end $$;
-- Après confirmation du compte du véritable propriétaire, IGC finalise le dossier.
select public.mp_creer_maquis('Maquis Buzz VIP','Bouaké','+225 01 51 01 22 87','owner@igc.test') as pilot_maquis_id \gset
select public.test_assert((select count(*) from public.mp_lister_preinscriptions()
  where statut='dossier_finalise')=1,'Dossier pilot lie au maquis');
reset role;
select public.test_assert(
  (select proprietaire_uid from public.mp_maquis where id=:'pilot_maquis_id'::uuid)
    ='22222222-2222-4222-8222-222222222222'::uuid,'Proprietaire authentifie conserve ses droits');
select public.test_assert(
  (select statut from public.mp_maquis where id=:'pilot_maquis_id'::uuid)='en_attente',
  'Licence toujours non active apres preinscription');

