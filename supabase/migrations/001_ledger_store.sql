-- Single-row JSON ledger (matches in-app Store shape). Server-only access via POSTGRES_URL.

create table if not exists ledger_store (
  id text primary key,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table ledger_store enable row level security;
