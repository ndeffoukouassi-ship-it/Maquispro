\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$
declare v_maquis uuid;v_before int;
begin
  select id into v_maquis from public.mp_maquis where nom='Maquis Test' limit 1;
  if v_maquis is null then raise exception 'Maquis test manquant';end if;
  begin
    perform public.mp_scanner_vente(v_maquis,'0123456789012',
      '66666666-6666-4666-8666-666666666666'::uuid,'especes');
    raise exception 'Une vente non autorisée a été acceptée';
  exception when others then
    if sqlerrm not like 'Ventes non activées par IGC%' then raise;end if;
  end;
end $$;
reset role;
select public.test_assert(
 (select count(*) from public.mp_ventes)=1,
 'Le verrou empêche de créer une nouvelle vente');
select public.test_assert(
 (select sum(stock)::int from public.mp_boissons)=23,
 'Le verrou ne modifie pas le stock');
select public.test_assert(
 (select sum(recettes_declarees)::int from public.mp_caisse)=650,
 'Le verrou ne modifie pas la caisse');
select public.test_assert(
 not has_table_privilege('authenticated','public.mp_parametres_igc','UPDATE'),
 'Les serveurs ne peuvent pas déverrouiller les ventes');
