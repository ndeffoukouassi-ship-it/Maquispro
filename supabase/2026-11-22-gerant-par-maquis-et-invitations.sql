-- MaquisPro (projet dedie) : un gerant actif par maquis et un maquis par gerant.
-- Invitation a usage unique de 48 h, liee a un e-mail verifie via Supabase Auth.
-- Aucune vente n'est deverrouillee par cette migration.
begin;

create unique index if not exists mp_un_gerant_actif_par_maquis
  on public.mp_membres(maquis_id)
  where role='gerant' and actif=true;
create unique index if not exists mp_un_maquis_actif_par_gerant
  on public.mp_membres(user_id)
  where role='gerant' and actif=true;

create table if not exists public.mp_invitations_gerant (
  id uuid primary key default gen_random_uuid(),
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  email text not null check (length(email) between 6 and 254 and email=lower(trim(email))),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  cree_par uuid not null references auth.users(id),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  utilise_le timestamptz,
  annule_le timestamptz
);
create index if not exists mp_invitation_gerant_maquis_idx
  on public.mp_invitations_gerant(maquis_id,cree_le desc);
alter table public.mp_invitations_gerant enable row level security;
revoke all on public.mp_invitations_gerant from public,anon,authenticated;

create or replace function public.mp_inviter_gerant(p_maquis uuid,p_email text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_email text;v_token text;
begin
  if auth.uid() is null or coalesce(public.mp_role(p_maquis),'')<>'proprietaire' then
    raise exception 'Seul le proprietaire peut inviter le gerant';
  end if;
  perform 1 from public.mp_maquis where id=p_maquis for update;
  if not found or not public.mp_est_actif(p_maquis) then raise exception 'Maquis inexistant ou licence inactive';end if;
  v_email:=lower(trim(coalesce(p_email,'')));
  if length(v_email) not between 6 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Adresse e-mail du gerant invalide';
  end if;
  if exists(select 1 from public.mp_membres where maquis_id=p_maquis and role='gerant' and actif) then
    raise exception 'Un gerant est deja actif : revoquez son acces avant de le remplacer';
  end if;
  if exists(select 1 from public.mp_maquis m join auth.users u on u.id=m.proprietaire_uid
    where m.id=p_maquis and lower(u.email)=v_email) then
    raise exception 'Le proprietaire ne peut pas etre invite comme gerant';
  end if;
  update public.mp_invitations_gerant set annule_le=now()
    where maquis_id=p_maquis and utilise_le is null and annule_le is null;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.mp_invitations_gerant
    (maquis_id,email,token_hash,cree_par,expire_le)
  values (p_maquis,v_email,encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid(),now()+interval '48 hours');
  return v_token;
end; $$;

create or replace function public.mp_accepter_invitation_gerant(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_email text;v_maquis uuid;v_inv public.mp_invitations_gerant%rowtype;
begin
  if auth.uid() is null then raise exception 'Connectez-vous avec le code recu par e-mail';end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Lien d invitation invalide';end if;
  select maquis_id into v_maquis from public.mp_invitations_gerant
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if v_maquis is null then raise exception 'Invitation introuvable';end if;
  perform 1 from public.mp_maquis where id=v_maquis for update;
  if not found then raise exception 'Maquis introuvable';end if;
  select * into v_inv from public.mp_invitations_gerant
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_inv.annule_le is not null or v_inv.utilise_le is not null or v_inv.expire_le<=now() then
    raise exception 'Invitation expiree, deja utilisee ou annulee';
  end if;
  if not public.mp_est_actif(v_inv.maquis_id) then raise exception 'Licence du maquis inactive';end if;
  select lower(email) into v_email from auth.users
    where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null or v_email<>v_inv.email then
    raise exception 'Connectez-vous avec l adresse e-mail invitee et confirmez-la';
  end if;
  if exists(select 1 from public.mp_membres
    where maquis_id=v_inv.maquis_id and role='gerant' and actif) then
    raise exception 'Ce maquis a deja un gerant actif';
  end if;
  if exists(select 1 from public.mp_membres
    where user_id=auth.uid() and role='gerant' and actif) then
    raise exception 'Ce compte gere deja un autre maquis';
  end if;
  if exists(select 1 from public.mp_membres
    where user_id=auth.uid() and maquis_id=v_inv.maquis_id and role='proprietaire') then
    raise exception 'Le proprietaire ne peut pas devenir gerant';
  end if;
  insert into public.mp_membres(maquis_id,user_id,role,actif)
    values(v_inv.maquis_id,auth.uid(),'gerant',true)
    on conflict(maquis_id,user_id) do update set role='gerant',actif=true;
  update public.mp_invitations_gerant set utilise_le=now() where id=v_inv.id;
  return v_inv.maquis_id;
end; $$;

create or replace function public.mp_gerant_du_maquis(p_maquis uuid)
returns table(email text,user_id uuid) language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or coalesce(public.mp_role(p_maquis),'')<>'proprietaire' then
    raise exception 'Acces proprietaire requis';
  end if;
  return query
    select u.email,m.user_id from public.mp_membres m
      join auth.users u on u.id=m.user_id
      where m.maquis_id=p_maquis and m.role='gerant' and m.actif;
end; $$;

create or replace function public.mp_retirer_gerant(p_maquis uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_nombre integer;
begin
  if auth.uid() is null or coalesce(public.mp_role(p_maquis),'')<>'proprietaire' then
    raise exception 'Acces proprietaire requis';
  end if;
  perform 1 from public.mp_maquis where id=p_maquis for update;
  if not found then raise exception 'Maquis introuvable';end if;
  update public.mp_membres set actif=false
    where maquis_id=p_maquis and role='gerant' and actif=true;
  get diagnostics v_nombre=row_count;
  update public.mp_invitations_gerant set annule_le=now()
    where maquis_id=p_maquis and utilise_le is null and annule_le is null;
  return v_nombre;
end; $$;

-- Le formulaire historique d'ajout de membre sert uniquement aux serveurs :
-- un gerant ne peut etre ajoute que par invitation liee a une adresse verifiee.
create or replace function public.mp_ajouter_membre(p_maquis uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid;v_role text;
begin
  if auth.uid() is null or coalesce(public.mp_role(p_maquis),'')<>'proprietaire' then
    raise exception 'Proprietaire requis';
  end if;
  if not public.mp_est_actif(p_maquis) then raise exception 'Licence inactive';end if;
  if p_role is distinct from 'serveur' then
    raise exception 'Le gerant doit etre invite par un lien personnel';
  end if;
  select id into v_uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_uid is null then raise exception 'Le compte du serveur doit exister';end if;
  select role into v_role from public.mp_membres
    where maquis_id=p_maquis and user_id=v_uid;
  if v_role in ('proprietaire','gerant') then
    raise exception 'Impossible de modifier le role du proprietaire ou du gerant';
  end if;
  insert into public.mp_membres(maquis_id,user_id,role,actif)
    values(p_maquis,v_uid,'serveur',true)
    on conflict(maquis_id,user_id) do update set role='serveur',actif=true;
  return v_uid;
end; $$;

revoke all on function public.mp_inviter_gerant(uuid,text) from public,anon,authenticated;
revoke all on function public.mp_accepter_invitation_gerant(text) from public,anon,authenticated;
revoke all on function public.mp_gerant_du_maquis(uuid) from public,anon,authenticated;
revoke all on function public.mp_retirer_gerant(uuid) from public,anon,authenticated;
revoke all on function public.mp_ajouter_membre(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mp_inviter_gerant(uuid,text) to authenticated;
grant execute on function public.mp_accepter_invitation_gerant(text) to authenticated;
grant execute on function public.mp_gerant_du_maquis(uuid) to authenticated;
grant execute on function public.mp_retirer_gerant(uuid) to authenticated;
grant execute on function public.mp_ajouter_membre(uuid,text,text) to authenticated;
commit;