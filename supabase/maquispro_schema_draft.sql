-- MaquisPro IGC | Brouillon de schéma Supabase autonome, NON APPLIQUÉ.
-- Le projet dédié doit être créé et son coût accepté avant exécution.
-- IMPORTANT : aucun accès aux projets E-PROF ou IGC AutoWash.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mp_igc_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appointed_at timestamptz not null default now()
);

create table if not exists public.mp_maquis (
  id uuid primary key default gen_random_uuid(),
  nom text not null check(length(trim(nom)) between 1 and 80),
  ville text not null default '',
  telephone text not null default '',
  adresse text not null default '',
  proprietaire_uid uuid not null references auth.users(id),
  statut text not null default 'en_attente' check(statut in ('en_attente','actif','expire','suspendu')),
  periode_abonnement text check(periode_abonnement in ('mensuel','annuel')),
  installation_fcfa integer not null default 10000 check(installation_fcfa=10000),
  mensualite_fcfa integer not null default 10000 check(mensualite_fcfa=10000),
  annuel_fcfa integer not null default 100000 check(annuel_fcfa=100000),
  active_le timestamptz,
  expire_le timestamptz,
  cree_le timestamptz not null default now()
);

create table if not exists public.mp_membres (
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('proprietaire','gerant','serveur')),
  actif boolean not null default true,
  ajoute_le timestamptz not null default now(),
  primary key(maquis_id,user_id)
);
create index if not exists mp_membres_user_idx on public.mp_membres(user_id) where actif=true;

create table if not exists public.mp_boissons (
  id uuid primary key default gen_random_uuid(),
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  nom text not null check(length(trim(nom)) between 1 and 120),
  code_barres text check(code_barres ~ '^[0-9]{8,14}$'),
  prix_achat integer not null check(prix_achat between 0 and 1000000000),
  prix_vente integer not null check(prix_vente between 1 and 1000000000),
  stock integer not null default 0 check(stock between 0 and 1000000000),
  seuil_alerte integer not null default 5 check(seuil_alerte>=0),
  actif boolean not null default true,
  modifie_le timestamptz not null default now(),
  unique(maquis_id,id)
);
create unique index if not exists mp_boisson_ean_unique on public.mp_boissons(maquis_id,code_barres) where code_barres is not null;
create index if not exists mp_boisson_maquis_idx on public.mp_boissons(maquis_id,nom);

create table if not exists public.mp_ventes (
  operation_id uuid not null,
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  boisson_id uuid not null,
  nom_boisson text not null,
  code_barres text not null,
  serveur_uid uuid not null references auth.users(id),
  prix_vente integer not null check(prix_vente>=0),
  prix_achat integer not null check(prix_achat>=0),
  benefice_brut integer not null,
  paiement_declare text not null check(paiement_declare in ('especes','wave','orange_money','mtn_money')),
  statut_paiement text not null check(statut_paiement in ('especes_declarees','mobile_non_verifie')),
  jour_caisse date not null,
  cree_le timestamptz not null default now(),
  primary key(maquis_id,operation_id),
  foreign key(maquis_id,boisson_id) references public.mp_boissons(maquis_id,id)
);
create index if not exists mp_ventes_rapports_idx on public.mp_ventes(maquis_id,cree_le desc);
create index if not exists mp_ventes_serveur_idx on public.mp_ventes(serveur_uid,maquis_id,cree_le desc);

create table if not exists public.mp_caisse (
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  jour date not null,
  statut text not null default 'ouverte' check(statut in ('ouverte','cloturee')),
  recettes_declarees bigint not null default 0 check(recettes_declarees>=0),
  especes_declarees bigint not null default 0 check(especes_declarees>=0),
  mobile_non_verifie bigint not null default 0 check(mobile_non_verifie>=0),
  mise_a_jour timestamptz not null default now(),
  primary key(maquis_id,jour)
);

create table if not exists public.mp_mouvements (
  id uuid primary key default gen_random_uuid(),
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  boisson_id uuid not null,
  type_mouvement text not null check(type_mouvement in ('entree','vente','ajustement')),
  quantite_signee integer not null check(quantite_signee<>0),
  cout_unitaire integer not null default 0 check(cout_unitaire>=0),
  auteur_uid uuid not null references auth.users(id),
  reference_operation uuid,
  cree_le timestamptz not null default now(),
  foreign key(maquis_id,boisson_id) references public.mp_boissons(maquis_id,id)
);

create table if not exists public.mp_depenses (
  id uuid primary key default gen_random_uuid(),
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  libelle text not null check(length(trim(libelle)) between 1 and 140),
  montant integer not null check(montant between 1 and 1000000000),
  auteur_uid uuid not null references auth.users(id),
  cree_le timestamptz not null default now()
);
create index if not exists mp_depenses_maquis_idx on public.mp_depenses(maquis_id,cree_le desc);

create table if not exists public.mp_inventaires (
  id uuid primary key default gen_random_uuid(),
  maquis_id uuid not null references public.mp_maquis(id) on delete cascade,
  periode text not null check(periode in ('jour','semaine','mois')),
  lignes jsonb not null check(jsonb_typeof(lignes)='array'),
  auteur_uid uuid not null references auth.users(id),
  cree_le timestamptz not null default now()
);

-- Données IGC : le propriétaire du schéma accorde l'accès administrateur
-- via une requête privilégiée APRES création manuelle du compte auth :
-- insert into public.mp_igc_admins(user_id) values('<UID ADMIN AUTH>');
-- NE PAS exécuter une attribution de rôle depuis le navigateur.

-- Fonctions d'autorisation limitées à l'identité vérifiée par Supabase Auth.
create or replace function public.mp_est_admin_igc()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists(
  select 1 from public.mp_igc_admins a where a.user_id=auth.uid()
); $$;

create or replace function public.mp_role(p_maquis uuid)
returns text language sql stable security definer set search_path = ''
as $$ select m.role from public.mp_membres m
      where m.maquis_id=p_maquis and m.user_id=auth.uid() and m.actif=true
      limit 1; $$;

create or replace function public.mp_est_actif(p_maquis uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.mp_maquis m
  where m.id=p_maquis and m.statut='actif' and m.expire_le>now()); $$;

-- Fermer les privilèges directs et la création de politiques permissives.
alter table public.mp_igc_admins enable row level security;
alter table public.mp_maquis enable row level security;
alter table public.mp_membres enable row level security;
alter table public.mp_boissons enable row level security;
alter table public.mp_ventes enable row level security;
alter table public.mp_caisse enable row level security;
alter table public.mp_mouvements enable row level security;
alter table public.mp_depenses enable row level security;
alter table public.mp_inventaires enable row level security;

revoke all on public.mp_igc_admins,public.mp_maquis,public.mp_membres,
 public.mp_boissons,public.mp_ventes,public.mp_caisse,public.mp_mouvements,
 public.mp_depenses,public.mp_inventaires from public,anon,authenticated;

grant select on public.mp_maquis,public.mp_membres,public.mp_boissons,
 public.mp_ventes,public.mp_caisse,public.mp_mouvements,
 public.mp_depenses,public.mp_inventaires to authenticated;

create policy mp_read_maquis on public.mp_maquis for select to authenticated
 using (public.mp_role(id) is not null or public.mp_est_admin_igc());
create policy mp_read_member on public.mp_membres for select to authenticated
 using ((user_id=auth.uid()) or (public.mp_role(maquis_id) in ('proprietaire','gerant'))
   or public.mp_est_admin_igc());
-- Prix d'achat : uniquement gestionnaire ou propriétaire.
create policy mp_read_drink on public.mp_boissons for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());
create policy mp_read_sale on public.mp_ventes for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());
create policy mp_read_cash on public.mp_caisse for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());
create policy mp_read_movement on public.mp_mouvements for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());
create policy mp_read_expense on public.mp_depenses for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());
create policy mp_read_inventory on public.mp_inventaires for select to authenticated
 using (public.mp_role(maquis_id) in ('proprietaire','gerant')
   or public.mp_est_admin_igc());

-- Listes filtrées pour serveur : pas de prix d'achat exposé.
create or replace function public.mp_catalogue_serveur(p_maquis uuid)
returns table(id uuid,nom text,prix_vente integer,stock integer,code_barres text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.mp_role(p_maquis) is null or not public.mp_est_actif(p_maquis) then
    raise exception 'Accès interdit';
  end if;
  return query select b.id,b.nom,b.prix_vente,b.stock,b.code_barres
    from public.mp_boissons b where b.maquis_id=p_maquis and b.actif=true order by b.nom;
end; $$;

-- Résumé de ventes d'un serveur sans exposer les coûts d'achat.
create or replace function public.mp_mes_ventes(p_maquis uuid)
returns table(operation_id uuid,nom_boisson text,prix_vente integer,cree_le timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.mp_role(p_maquis) is null then raise exception 'Accès interdit'; end if;
  return query select v.operation_id,v.nom_boisson,v.prix_vente,v.cree_le
    from public.mp_ventes v where v.maquis_id=p_maquis and v.serveur_uid=auth.uid()
    order by v.cree_le desc limit 100;
end; $$;

-- Création de licence : réservée au personnel IGC autorisé.
create or replace function public.mp_creer_maquis(
  p_nom text,p_ville text,p_telephone text,p_email_proprietaire text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;v_id uuid;
begin
  if not public.mp_est_admin_igc() then raise exception 'Administrateur IGC requis';end if;
  if length(trim(p_nom)) not between 1 and 80 then raise exception 'Nom invalide';end if;
  select u.id into v_uid from auth.users u where lower(u.email)=lower(trim(p_email_proprietaire)) limit 1;
  if v_uid is null then raise exception 'Le propriétaire doit d’abord créer son compte';end if;
  insert into public.mp_maquis(nom,ville,telephone,proprietaire_uid)
    values(trim(p_nom),coalesce(p_ville,''),coalesce(p_telephone,''),v_uid) returning id into v_id;
  insert into public.mp_membres(maquis_id,user_id,role) values(v_id,v_uid,'proprietaire');
  return v_id;
end; $$;

create or replace function public.mp_activer_maquis(p_maquis uuid,p_duree_mois integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_fin timestamptz;
begin
  if not public.mp_est_admin_igc() then raise exception 'Administrateur IGC requis';end if;
  if p_duree_mois not in (1,12) then raise exception 'Durée : 1 ou 12 mois';end if;
  update public.mp_maquis set
    statut='actif',periode_abonnement=case when p_duree_mois=12 then 'annuel' else 'mensuel' end,
    active_le=coalesce(active_le,now()),
    expire_le=greatest(coalesce(expire_le,now()),now())+make_interval(months=>p_duree_mois)
    where id=p_maquis returning expire_le into v_fin;
  if not found then raise exception 'Maquis inexistant';end if;
  return jsonb_build_object('maquis_id',p_maquis,'expire_le',v_fin);
end; $$;

create or replace function public.mp_ajouter_membre(p_maquis uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;v_role text;
begin
  if public.mp_role(p_maquis)<>'proprietaire' then raise exception 'Propriétaire requis';end if;
  if not public.mp_est_actif(p_maquis) then raise exception 'Licence inactive';end if;
  if p_role not in ('gerant','serveur') then raise exception 'Rôle invalide';end if;
  select id into v_uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_uid is null then raise exception 'Le compte doit exister';end if;
  select role into v_role from public.mp_membres where maquis_id=p_maquis and user_id=v_uid;
  if v_role='proprietaire' then raise exception 'Impossible de modifier le propriétaire';end if;
  insert into public.mp_membres(maquis_id,user_id,role,actif)
    values(p_maquis,v_uid,p_role,true)
    on conflict(maquis_id,user_id) do update set role=excluded.role,actif=true;
  return v_uid;
end; $$;

create or replace function public.mp_ajouter_boisson(
  p_maquis uuid,p_nom text,p_achat integer,p_vente integer,p_code text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;v_code text;
begin
  if public.mp_role(p_maquis) not in ('proprietaire','gerant') or not public.mp_est_actif(p_maquis)
    then raise exception 'Gestionnaire ou licence active requis';end if;
  if length(trim(p_nom)) not between 1 and 120 then raise exception 'Nom invalide';end if;
  if p_achat<0 or p_achat>1000000000 or p_vente<1 or p_vente>1000000000
    then raise exception 'Prix invalides';end if;
  v_code:=nullif(trim(coalesce(p_code,'')),'');
  if v_code is not null and v_code !~ '^[0-9]{8,14}$' then raise exception 'Code-barres invalide';end if;
  insert into public.mp_boissons(maquis_id,nom,code_barres,prix_achat,prix_vente)
    values(p_maquis,trim(p_nom),v_code,p_achat,p_vente) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.mp_approvisionner(
  p_maquis uuid,p_boisson uuid,p_quantite integer,p_cout_unitaire integer)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_rec public.mp_boissons%rowtype;v_stock integer;v_avg integer;
begin
  if public.mp_role(p_maquis) not in ('proprietaire','gerant') or not public.mp_est_actif(p_maquis)
    then raise exception 'Accès interdit';end if;
  if p_quantite<1 or p_quantite>100000 or p_cout_unitaire<0 or p_cout_unitaire>1000000000
    then raise exception 'Approvisionnement invalide';end if;
  select * into v_rec from public.mp_boissons
    where id=p_boisson and maquis_id=p_maquis and actif=true for update;
  if not found then raise exception 'Boisson introuvable';end if;
  v_stock:=v_rec.stock+p_quantite;
  if v_stock>1000000000 then raise exception 'Stock trop important';end if;
  v_avg:=round((v_rec.stock::numeric*v_rec.prix_achat+p_quantite::numeric*p_cout_unitaire)/v_stock)::integer;
  update public.mp_boissons set stock=v_stock,prix_achat=v_avg,modifie_le=now() where id=p_boisson;
  insert into public.mp_mouvements(maquis_id,boisson_id,type_mouvement,quantite_signee,cout_unitaire,auteur_uid)
    values(p_maquis,p_boisson,'entree',p_quantite,p_cout_unitaire,auth.uid());
  return v_stock;
end; $$;

-- Un scan = une vente, un mouvement de stock, une caisse unique.
-- PostgreSQL sérialise les scans concurrents sur la ligne boisson (FOR UPDATE).
-- p_operation empêche une vente en double lorsqu'un téléphone réessaie la requête.
create or replace function public.mp_scanner_vente(
  p_maquis uuid,p_code text,p_operation uuid,p_paiement text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_b public.mp_boissons%rowtype;v_sale public.mp_ventes%rowtype;
  v_jour date;v_payment text;v_updated integer;
begin
  if public.mp_role(p_maquis) not in ('proprietaire','gerant','serveur')
    or not public.mp_est_actif(p_maquis) then raise exception 'Licence ou compte non actif';end if;
  if p_code is null or p_code !~ '^[0-9]{8,14}$' then raise exception 'Code-barres incorrect';end if;
  if p_operation is null then raise exception 'Identifiant du scan requis';end if;
  if p_paiement not in ('especes','wave','orange_money','mtn_money') then
    raise exception 'Paiement déclaré invalide';end if;
  -- Un code-barres EAN appartient à une référence de boisson du même maquis.
  select * into v_b from public.mp_boissons
    where maquis_id=p_maquis and code_barres=p_code and actif=true for update;
  if not found then raise exception 'Boisson inconnue';end if;
  select * into v_sale from public.mp_ventes
    where maquis_id=p_maquis and operation_id=p_operation;
  if found then
    if v_sale.serveur_uid<>auth.uid() or v_sale.code_barres<>p_code or v_sale.paiement_declare<>p_paiement
      then raise exception 'Opération déjà utilisée';end if;
    return jsonb_build_object('operation_id',p_operation,'boisson',v_sale.nom_boisson,
      'prix',v_sale.prix_vente,'marge',v_sale.benefice_brut,'stock_restant',null,'duplicata',true);
  end if;
  if v_b.stock<=0 then raise exception 'Stock épuisé';end if;
  v_jour:=(now() at time zone 'Africa/Abidjan')::date;
  v_payment:=case when p_paiement='especes' then 'especes_declarees' else 'mobile_non_verifie' end;
  update public.mp_boissons set stock=stock-1,modifie_le=now()
    where id=v_b.id and maquis_id=p_maquis;
  insert into public.mp_ventes(operation_id,maquis_id,boisson_id,nom_boisson,code_barres,
    serveur_uid,prix_vente,prix_achat,benefice_brut,paiement_declare,statut_paiement,jour_caisse)
    values(p_operation,p_maquis,v_b.id,v_b.nom,p_code,auth.uid(),v_b.prix_vente,
      v_b.prix_achat,v_b.prix_vente-v_b.prix_achat,p_paiement,v_payment,v_jour);
  insert into public.mp_mouvements(maquis_id,boisson_id,type_mouvement,quantite_signee,
    cout_unitaire,auteur_uid,reference_operation)
    values(p_maquis,v_b.id,'vente',-1,v_b.prix_achat,auth.uid(),p_operation);
  insert into public.mp_caisse(maquis_id,jour,recettes_declarees,especes_declarees,mobile_non_verifie)
    values(p_maquis,v_jour,v_b.prix_vente,
      case when p_paiement='especes' then v_b.prix_vente else 0 end,
      case when p_paiement<>'especes' then v_b.prix_vente else 0 end)
    on conflict(maquis_id,jour) do update set
      recettes_declarees=public.mp_caisse.recettes_declarees+excluded.recettes_declarees,
      especes_declarees=public.mp_caisse.especes_declarees+excluded.especes_declarees,
      mobile_non_verifie=public.mp_caisse.mobile_non_verifie+excluded.mobile_non_verifie,
      mise_a_jour=now()
    where public.mp_caisse.statut='ouverte';
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'Caisse clôturée';end if;
  return jsonb_build_object('operation_id',p_operation,'boisson',v_b.nom,'prix',v_b.prix_vente,
    'marge',v_b.prix_vente-v_b.prix_achat,'stock_restant',v_b.stock-1,'duplicata',false,
    'statut_paiement',v_payment);
end; $$;

create or replace function public.mp_depense(
  p_maquis uuid,p_libelle text,p_montant integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if public.mp_role(p_maquis) not in ('proprietaire','gerant') or not public.mp_est_actif(p_maquis)
    then raise exception 'Accès interdit';end if;
  if length(trim(p_libelle)) not between 1 and 140 or p_montant<1 or p_montant>1000000000
    then raise exception 'Dépense invalide';end if;
  insert into public.mp_depenses(maquis_id,libelle,montant,auteur_uid)
    values(p_maquis,trim(p_libelle),p_montant,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.mp_inventaire(
  p_maquis uuid,p_periode text,p_comptages jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;v_row record;v_b public.mp_boissons%rowtype;v_lignes jsonb:='[]'::jsonb;
begin
  if public.mp_role(p_maquis) not in ('proprietaire','gerant') or not public.mp_est_actif(p_maquis)
    then raise exception 'Accès interdit';end if;
  if p_periode not in ('jour','semaine','mois')
    or jsonb_typeof(p_comptages)<>'object'
    or jsonb_object_length(p_comptages)>100 or jsonb_object_length(p_comptages)=0
    then raise exception 'Comptage invalide';end if;
  for v_row in select key,value from jsonb_each_text(p_comptages) loop
    if v_row.value !~ '^[0-9]{1,9}$' then raise exception 'Quantité physique invalide';end if;
    select * into v_b from public.mp_boissons where id=v_row.key::uuid and maquis_id=p_maquis;
    if not found then raise exception 'Boisson absente du maquis';end if;
    v_lignes:=v_lignes||jsonb_build_array(jsonb_build_object('boisson_id',v_b.id,'nom',v_b.nom,
      'theorique',v_b.stock,'compte',(v_row.value)::integer,'ecart',(v_row.value)::integer-v_b.stock));
  end loop;
  insert into public.mp_inventaires(maquis_id,periode,lignes,auteur_uid)
    values(p_maquis,p_periode,v_lignes,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC sur les nouvelles fonctions.
-- Fermer explicitement tous les RPC, puis n'accorder qu'à authenticated.
revoke all on function public.mp_est_admin_igc() from public,anon;
revoke all on function public.mp_role(uuid) from public,anon;
revoke all on function public.mp_est_actif(uuid) from public,anon;
revoke all on function public.mp_catalogue_serveur(uuid) from public,anon;
revoke all on function public.mp_mes_ventes(uuid) from public,anon;
revoke all on function public.mp_creer_maquis(text,text,text,text) from public,anon;
revoke all on function public.mp_activer_maquis(uuid,integer) from public,anon;
revoke all on function public.mp_ajouter_membre(uuid,text,text) from public,anon;
revoke all on function public.mp_ajouter_boisson(uuid,text,integer,integer,text) from public,anon;
revoke all on function public.mp_approvisionner(uuid,uuid,integer,integer) from public,anon;
revoke all on function public.mp_scanner_vente(uuid,text,uuid,text) from public,anon;
revoke all on function public.mp_depense(uuid,text,integer) from public,anon;
revoke all on function public.mp_inventaire(uuid,text,jsonb) from public,anon;

grant execute on function public.mp_est_admin_igc() to authenticated;
grant execute on function public.mp_role(uuid) to authenticated;
grant execute on function public.mp_est_actif(uuid) to authenticated;
grant execute on function public.mp_catalogue_serveur(uuid) to authenticated;
grant execute on function public.mp_mes_ventes(uuid) to authenticated;
grant execute on function public.mp_creer_maquis(text,text,text,text) to authenticated;
grant execute on function public.mp_activer_maquis(uuid,integer) to authenticated;
grant execute on function public.mp_ajouter_membre(uuid,text,text) to authenticated;
grant execute on function public.mp_ajouter_boisson(uuid,text,integer,integer,text) to authenticated;
grant execute on function public.mp_approvisionner(uuid,uuid,integer,integer) to authenticated;
grant execute on function public.mp_scanner_vente(uuid,text,uuid,text) to authenticated;
grant execute on function public.mp_depense(uuid,text,integer) to authenticated;
grant execute on function public.mp_inventaire(uuid,text,jsonb) to authenticated;

-- Realtime : après tests, ajouter les tables à la publication supabase_realtime.
-- Une activation prématurée peut exposer des changements si les permissions sont mal réglées.
-- alter publication supabase_realtime add table public.mp_boissons,public.mp_ventes,public.mp_caisse;
