\set ON_ERROR_STOP on
-- Test uniquement sur PostgreSQL local (GitHub Actions), avec identites factices.
-- Un propriétaire peut ouvrir plusieurs maquis, chacun avec un seul gerant.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.mp_creer_maquis('Maquis Second','Abidjan','0200000000','owner@igc.test') as second_id \gset
select public.mp_activer_maquis(:'second_id'::uuid,1);
reset role;
select id as first_id from public.mp_maquis where nom='Maquis Test' limit 1 \gset
select public.test_assert((select count(*) from public.mp_maquis where proprietaire_uid='22222222-2222-4222-8222-222222222222')=2,'Un propriétaire peut posseder deux maquis');

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.mp_inviter_gerant(:'first_id'::uuid,'gerant1@igc.test') as token1 \gset
select public.test_assert(length(:'token1')=64,'Lien d invitation a token fort');
select public.mp_inviter_gerant(:'second_id'::uuid,'gerant2@igc.test') as token2 \gset
select public.test_assert(length(:'token2')=64,'Invitation distincte par maquis');

-- Un destinataire qui ne possède pas l'e-mail invité ne peut pas accepter.
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
select set_config('test.invitation_token',:'token1',false);
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_accepter_invitation_gerant(current_setting('test.invitation_token'));
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: destinataire non invite accepte';end if;
end $$;

-- Chaque adresse confirmée accepte uniquement son maquis.
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select public.mp_accepter_invitation_gerant(:'token1') as accepted1 \gset
select public.test_assert(:'accepted1'::uuid=:'first_id'::uuid,'Gerant 1 lie au maquis 1');
select public.test_assert(public.mp_role(:'second_id'::uuid) is null,'Gerant 1 sans acces maquis 2');
select set_config('test.invitation_token',:'token1',false);
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_accepter_invitation_gerant(current_setting('test.invitation_token'));
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: jeton utilise une seconde fois';end if;
end $$;

set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';
select public.mp_accepter_invitation_gerant(:'token2') as accepted2 \gset
select public.test_assert(:'accepted2'::uuid=:'second_id'::uuid,'Gerant 2 lie au maquis 2');
select public.test_assert(public.mp_role(:'first_id'::uuid) is null,'Gerant 2 sans acces maquis 1');

set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.test_assert((select count(*) from public.mp_membres where role='gerant' and actif)=2,'Un gerant actif par maquis');
select set_config('test.maquis_id',:'first_id',false);
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_inviter_gerant(current_setting('test.maquis_id')::uuid,'gerant3@igc.test');
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: invitation d un second gerant actif';end if;
end $$;
do $$
declare blocked boolean:=false;
begin
  begin
    perform public.mp_ajouter_membre(current_setting('test.maquis_id')::uuid,'gerant3@igc.test','gerant');
  exception when others then blocked:=true;
  end;
  if not blocked then raise exception 'Test: ancien formulaire contourne invitation';end if;
end $$;

-- Remplacement volontaire : retrait ancien accès puis nouveau lien.
select public.test_assert(public.mp_retirer_gerant(:'first_id'::uuid)=1,'Revocation du gerant 1');
select public.mp_inviter_gerant(:'first_id'::uuid,'gerant3@igc.test') as token3 \gset
set request.jwt.claim.sub='77777777-7777-4777-8777-777777777777';
select public.mp_accepter_invitation_gerant(:'token3') as accepted3 \gset
select public.test_assert(:'accepted3'::uuid=:'first_id'::uuid,'Nouveau gerant sur premier maquis');
select public.test_assert(public.mp_role(:'second_id'::uuid) is null,'Nouveau gerant sans acces au deuxieme maquis');
reset role;
select public.test_assert((select count(*) from public.mp_membres where role='gerant' and actif)=2,'Toujours exactement deux gerants actifs pour deux maquis');
select public.test_assert((select count(*) from public.mp_invitations_gerant where utilise_le is not null)=3,'Invitations a usage unique enregistrees');
