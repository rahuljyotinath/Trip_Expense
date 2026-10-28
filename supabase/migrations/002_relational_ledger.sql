-- Normalized ledger (replaces monolithic ledger_store.data for app reads/writes).

create table if not exists profiles (
  id text primary key,
  username text not null,
  password_hash text not null default '',
  name text not null,
  email text,
  phone text,
  created_at text not null
);

create unique index if not exists profiles_username_lower_idx on profiles (lower(username));
create index if not exists profiles_email_lower_idx on profiles (lower(email)) where email is not null;

create table if not exists trips (
  id text primary key,
  name text not null,
  code text not null,
  currency text not null,
  start_date text,
  end_date text,
  created_by_profile_id text not null references profiles (id),
  created_at text not null,
  join_approval_required boolean not null default false,
  ledger_day_order jsonb,
  version bigint not null default 1
);

create unique index if not exists trips_code_idx on trips (code);
create index if not exists trips_created_by_idx on trips (created_by_profile_id);

create table if not exists trip_admin_profiles (
  trip_id text not null references trips (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  primary key (trip_id, profile_id)
);

create table if not exists members (
  id text primary key,
  trip_id text not null references trips (id) on delete cascade,
  name text not null,
  profile_id text references profiles (id),
  covered_by_member_id text references members (id) on delete set null
);

create index if not exists members_trip_id_idx on members (trip_id);
create index if not exists members_profile_id_idx on members (profile_id) where profile_id is not null;

create table if not exists expenses (
  id text primary key,
  trip_id text not null references trips (id) on delete cascade,
  date text not null,
  amount double precision not null,
  reason text not null default '',
  paid_by_member_id text not null,
  participant_ids jsonb not null default '[]'::jsonb,
  split text not null default 'equal',
  shares jsonb not null default '{}'::jsonb,
  created_by_profile_id text not null,
  created_at text not null,
  voided_at text,
  voided_by_profile_id text
);

create index if not exists expenses_trip_id_idx on expenses (trip_id);
create index if not exists expenses_trip_date_idx on expenses (trip_id, date);

create table if not exists payments (
  id text primary key,
  trip_id text not null references trips (id) on delete cascade,
  date text not null,
  amount double precision not null,
  from_member_id text not null,
  to_member_id text not null,
  created_by_profile_id text not null,
  created_at text not null,
  voided_at text,
  voided_by_profile_id text
);

create index if not exists payments_trip_id_idx on payments (trip_id);
create index if not exists payments_trip_date_idx on payments (trip_id, date);

create table if not exists join_requests (
  id text primary key,
  group_id text not null references trips (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  status text not null,
  created_at text not null,
  decided_at text,
  decided_by_profile_id text references profiles (id)
);

create index if not exists join_requests_group_profile_idx on join_requests (group_id, profile_id);
create index if not exists join_requests_profile_idx on join_requests (profile_id);

create table if not exists trip_invites (
  id text primary key,
  group_id text not null references trips (id) on delete cascade,
  invited_email text,
  invited_phone text,
  status text not null,
  created_by_profile_id text not null references profiles (id),
  created_at text not null,
  responded_at text,
  responded_by_profile_id text references profiles (id)
);

create index if not exists trip_invites_group_idx on trip_invites (group_id);
create index if not exists trip_invites_status_idx on trip_invites (status);

create table if not exists contacts (
  id text primary key,
  owner_profile_id text not null references profiles (id) on delete cascade,
  target_profile_id text not null references profiles (id) on delete cascade,
  source text not null default 'search',
  created_at text not null,
  unique (owner_profile_id, target_profile_id)
);

create index if not exists contacts_owner_idx on contacts (owner_profile_id);

create table if not exists ledger_meta (
  id text primary key,
  version bigint not null default 1
);

insert into ledger_meta (id, version)
values ('main', 1)
on conflict (id) do nothing;
