\set ON_ERROR_STOP on
-- Vérifier identité et rôles avec la base test locale, sans toucher à Supabase Cloud.
insert into public.mp_igc_admins(user_id) values('11111111-1111-4111-8111-111111111111');
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.mp_creer_maquis('Maquis Test','Bouaké','0102030405','owner@igc.test') as maquis_id \gset
select public.mp_activer_maquis(:'maquis_id'::uuid,1);
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.mp_ajouter_membre(:'maquis_id'::uuid,'serveur@igc.test','serveur');
select public.mp_ajouter_boisson(:'maquis_id'::uuid,'Castel 65 cl',550,650,'0123456789012') as drink_id \gset
select public.mp_approvisionner(:'maquis_id'::uuid,:'drink_id'::uuid,24,550);
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select public.mp_scanner_vente(:'maquis_id'::uuid,'0123456789012',
  '55555555-5555-4555-8555-555555555555'::uuid,'especes') as receipt \gset
-- Le même ID de scan doit être idempotent.
select public.mp_scanner_vente(:'maquis_id'::uuid,'0123456789012',
  '55555555-5555-4555-8555-555555555555'::uuid,'especes') as retry \gset
do $$
begin
  if (:'receipt'::jsonb->>'prix')::int<>650 then raise exception 'Prix vente incorrect';end if;
  if (:'receipt'::jsonb->>'marge')::int<>100 then raise exception 'Marge incorrecte';end if;
  if (:'retry'::jsonb->>'duplicata')::boolean<>true then raise exception 'Double scan incorrect';end if;
end $$;
-- Un serveur ne doit pas pouvoir lire les coûts d'achat bruts ou la caisse.
select count(*) as direct_drinks from public.mp_boissons \gset
select count(*) as direct_sales from public.mp_ventes \gset
select count(*) as direct_cash from public.mp_caisse \gset
do $$
begin
  if :direct_drinks::int<>0 or :direct_sales::int<>0 or :direct_cash::int<>0
    then raise exception 'RLS échoué : le serveur voit des données de gestion';end if;
end $$;
select count(*) as server_catalogue from public.mp_catalogue_serveur(:'maquis_id'::uuid) \gset
do $$
begin
  if :server_catalogue::int<>1 then raise exception 'Catalogue serveur inaccessible';end if;
end $$;
reset role;
select stock as last_stock from public.mp_boissons where id=:'drink_id'::uuid \gset
select count(*) as sale_count from public.mp_ventes where maquis_id=:'maquis_id'::uuid \gset
select recettes_declarees as cash_total from public.mp_caisse where maquis_id=:'maquis_id'::uuid \gset
do $$
begin
  if :last_stock::int<>23 then raise exception 'Stock incorrect';end if;
  if :sale_count::int<>1 then raise exception 'Vente doublée';end if;
  if :cash_total::int<>650 then raise exception 'Caisse incorrecte';end if;
end $$;
