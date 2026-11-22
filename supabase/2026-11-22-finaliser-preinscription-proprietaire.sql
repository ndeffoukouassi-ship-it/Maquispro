-- Finaliser automatiquement la préinscription lorsqu'IGC enregistre
-- le maquis avec le compte e-mail confirmé de son vrai propriétaire.
begin;
create or replace function public.mp_creer_maquis(
  p_nom text,p_ville text,p_telephone text,p_email_proprietaire text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid;v_id uuid;
begin
  if auth.uid() is null or not public.mp_est_admin_igc() then
    raise exception 'Administrateur IGC requis';
  end if;
  if p_nom is null or length(trim(p_nom)) not between 1 and 80 then
    raise exception 'Nom invalide';
  end if;
  select u.id into v_uid from auth.users u
    where lower(u.email)=lower(trim(coalesce(p_email_proprietaire,'')))
      and u.email_confirmed_at is not null limit 1;
  if v_uid is null then
    raise exception 'La propriétaire doit d abord créer et confirmer son compte personnel';
  end if;
  if exists(
    select 1 from public.mp_maquis m
    where lower(m.nom)=lower(trim(p_nom))
      and lower(m.ville)=lower(trim(coalesce(p_ville,'')))
      and m.telephone=trim(coalesce(p_telephone,''))
  ) then
    raise exception 'Ce maquis existe déjà ; ouvre son dossier au lieu de le créer deux fois';
  end if;
  insert into public.mp_maquis(nom,ville,telephone,proprietaire_uid)
    values(trim(p_nom),trim(coalesce(p_ville,'')),trim(coalesce(p_telephone,'')),v_uid)
    returning id into v_id;
  insert into public.mp_membres(maquis_id,user_id,role)
    values(v_id,v_uid,'proprietaire');

  update public.mp_preinscriptions p
    set statut='dossier_finalise',finalise_le=now(),
        email_proprietaire=lower(trim(p_email_proprietaire)),maquis_id=v_id
    where p.nom=trim(p_nom)
      and p.ville=trim(coalesce(p_ville,''))
      and p.telephone=trim(coalesce(p_telephone,''))
      and p.statut='en_attente_proprietaire';
  return v_id;
end $$;
revoke all on function public.mp_creer_maquis(text,text,text,text) from public,anon,authenticated;
grant execute on function public.mp_creer_maquis(text,text,text,text) to authenticated;
commit;