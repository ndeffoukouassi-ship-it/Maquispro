\set ON_ERROR_STOP on
create schema if not exists auth;
create schema if not exists extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create table auth.users (id uuid primary key,email text unique not null,email_confirmed_at timestamptz default now());
create or replace function auth.uid()
returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated;
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','admin@igc.test'),
('22222222-2222-4222-8222-222222222222','owner@igc.test'),
('33333333-3333-4333-8333-333333333333','serveur@igc.test'),
('44444444-4444-4444-8444-444444444444','outsider@igc.test'),
('55555555-5555-4555-8555-555555555555','gerant1@igc.test'),
('66666666-6666-4666-8666-666666666666','gerant2@igc.test'),
('77777777-7777-4777-8777-777777777777','gerant3@igc.test');

create or replace function public.test_assert(ok boolean,msg text)
returns text language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'SMOKE TEST FAILED: %',msg; end if;
 return 'OK';
end $$;
grant execute on function public.test_assert(boolean,text) to authenticated;
