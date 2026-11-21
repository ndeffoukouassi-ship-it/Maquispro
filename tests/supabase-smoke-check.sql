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
select public.test_assert((:'receipt'::jsonb->>'prix')::integer=650,'Prix de vente');
select public.test_assert((:'receipt'::jsonb->>'marge')::integer=100,'Marge brute');
select public.test_assert((:'retry'::jsonb->>'duplicata')::boolean=true,'Idempotence');
-- Un serveur ne doit pas pouvoir lire les coûts d'achat bruts ou la caisse.
select count(*) as direct_drinks from public.mp_boissons \gset
select count(*) as direct_sales from public.mp_ventes \gset
select count(*) as direct_cash from public.mp_caisse \gset
select public.test_assert(:direct_drinks::integer=0,'RLS catalogue');
select public.test_assert(:direct_sales::integer=0,'RLS ventes');
select public.test_assert(:direct_cash::integer=0,'RLS caisse');
select count(*) as server_catalogue from public.mp_catalogue_serveur(:'maquis_id'::uuid) \gset
select public.test_assert(:server_catalogue::integer=1,'Catalogue serveur');
reset role;
select stock as last_stock from public.mp_boissons where id=:'drink_id'::uuid \gset
select count(*) as sale_count from public.mp_ventes where maquis_id=:'maquis_id'::uuid \gset
select recettes_declarees as cash_total from public.mp_caisse where maquis_id=:'maquis_id'::uuid \gset
select public.test_assert(:last_stock::integer=23,'Stock final');
select public.test_assert(:sale_count::integer=1,'Nombre ventes');
select public.test_assert(:cash_total::integer=650,'Caisse finale');
