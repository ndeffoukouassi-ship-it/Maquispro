-- MaquisPro : verrou de mise en service central, indépendant du navigateur.
-- Par défaut, aucune vente ne peut être inscrite pendant les essais de configuration.
create table if not exists public.mp_parametres_igc (
  cle text primary key,
  ventes_actives boolean not null default false,
  modifie_le timestamptz not null default now()
);
alter table public.mp_parametres_igc enable row level security;
revoke all on public.mp_parametres_igc from public,anon,authenticated;
insert into public.mp_parametres_igc(cle,ventes_actives) values('global',false)
on conflict(cle) do nothing;

create or replace function public.mp_verrou_ventes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists(select 1 from public.mp_parametres_igc
     where cle='global' and ventes_actives=true)
  then
    raise exception 'Ventes non activées par IGC. Aucun débit de stock ni aucune recette enregistrée.';
  end if;
  return new;
end $$;
revoke all on function public.mp_verrou_ventes() from public,anon,authenticated;
drop trigger if exists mp_verrou_insert_ventes on public.mp_ventes;
create trigger mp_verrou_insert_ventes
  before insert on public.mp_ventes
  for each row
  execute function public.mp_verrou_ventes();
