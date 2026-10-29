-- All application data is server-only. Tripzy does not use Supabase Auth JWTs.
alter table trip_invites add column if not exists invited_profile_id text references profiles(id);

create table if not exists auth_sessions (
  id text primary key,
  profile_id text not null,
  expires_at timestamptz not null
);
create index if not exists auth_sessions_profile_idx on auth_sessions(profile_id);
create table if not exists auth_rate_limits (
  id text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create table if not exists auth_recovery_codes (
  profile_id text primary key,
  code_hash text not null
);

do $$
declare table_name text; api_role text;
begin
  foreach table_name in array array['ledger_store','profiles','trips','members','expenses',
    'payments','trip_admin_profiles','join_requests','trip_invites','contacts','ledger_meta',
    'auth_sessions','auth_rate_limits','auth_recovery_codes']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public', table_name);
    foreach api_role in array array['anon','authenticated','service_role'] loop
      if exists(select 1 from pg_roles where rolname = api_role) then
        execute format('revoke all on table public.%I from %I', table_name, api_role);
      end if;
    end loop;
  end loop;
  foreach api_role in array array['anon','authenticated','service_role'] loop
    if exists(select 1 from pg_roles where rolname = api_role) then
      execute format('alter default privileges in schema public revoke all on tables from %I', api_role);
    end if;
  end loop;
end $$;
