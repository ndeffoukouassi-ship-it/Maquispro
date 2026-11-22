-- Préinscription non commerciale d'un maquis avant création du compte propriétaire.
-- Aucun accès propriétaire/gérant, licence ou vente n'est accordé ici.
begin;
create table if not exists public.mp_preinscriptions (
  id uuid primary key default gen_random_uuid(),
  nom text not null check(length(trim(nom)) between 1 and 80),
  ville text not null default '',
  quartier text not null default '',
  telephone text not null default '',
  email_proprietaire text,
  statut text not null default 'en_attente_proprietaire'
    check(statut in ('en_attente_proprietaire','dossier_finalise')),
  cree_le timestamptz not null default now(),
  finalise_le timestamptz,
  maquis_id uuid references public.mp_maquis(id),
  unique(nom,ville,telephone)
);
alter table public.mp_preinscriptions enable row level security;
revoke all on public.mp_preinscriptions from public,anon,authenticated;

create or replace function public.mp_lister_preinscriptions()
returns table(
  id uuid,nom text,ville text,quartier text,telephone text,
  email_proprietaire text,statut text,cree_le timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.mp_est_admin_igc() then
    raise exception 'Administrateur IGC requis';
  end if;
  return query select p.id,p.nom,p.ville,p.quartier,p.telephone,
    p.email_proprietaire,p.statut,p.cree_le
    from public.mp_preinscriptions p order by p.cree_le desc limit 200;
end $$;
revoke all on function public.mp_lister_preinscriptions() from public,anon,authenticated;
grant execute on function public.mp_lister_preinscriptions() to authenticated;

create or replace function public.mp_preinscrire_maquis(
  p_nom text,p_ville text,p_quartier text,p_telephone text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.mp_est_admin_igc() then
    raise exception 'Administrateur IGC requis';
  end if;
  if length(trim(coalesce(p_nom,''))) not between 1 and 80 then
    raise exception 'Nom du maquis invalide';
  end if;
  if length(trim(coalesce(p_ville,''))) not between 1 and 80 then
    raise exception 'Ville invalide';
  end if;
  if length(trim(coalesce(p_quartier,''))) > 120
     or length(trim(coalesce(p_telephone,''))) not between 7 and 25 then
    raise exception 'Coordonnées invalides';
  end if;
  insert into public.mp_preinscriptions(nom,ville,quartier,telephone)
    values(trim(p_nom),trim(p_ville),trim(coalesce(p_quartier,'')),trim(p_telephone))
  on conflict(nom,ville,telephone) do update set
    quartier=excluded.quartier
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.mp_preinscrire_maquis(text,text,text,text) from public,anon,authenticated;
grant execute on function public.mp_preinscrire_maquis(text,text,text,text) to authenticated;
commit;