# ADR 0003: Relational Postgres ledger

## Status

Accepted

## Context

ADR 0002 stored invites and join requests inside a single `ledger_store.data` JSON document. Every write loaded and saved the full blob, so latency grew with total app data.

## Decision

- Add normalized tables: `profiles`, `trips`, `members`, `expenses`, `payments`, `join_requests`, `trip_invites`, `contacts`, plus `ledger_meta` for optimistic concurrency on meta writes.
- Per-trip **`trips.version`** for PATCH conflicts on a single trip.
- Keep [`operations.ts`](../src/lib/operations.ts) mutating an in-memory [`Store`](../src/lib/types.ts); [`ledger-repository.ts`](../src/lib/ledger-repository.ts) loads scoped slices and persists diffs.
- **`LEDGER_BACKEND`**: `relational` (default when `trips` table exists) or `blob` to use legacy `ledger_store` only.
- Backfill via [`scripts/migrate-blob-to-relational.ts`](../../scripts/migrate-blob-to-relational.ts) after applying [`002_relational_ledger.sql`](../../supabase/migrations/002_relational_ledger.sql).

## Consequences

- Trip PATCH reads/writes one trip’s rows, not the monolithic JSON.
- Home trip list queries `members.profile_id` instead of parsing the full ledger.
- Legacy blob row may remain for export/rollback; app writes go to relational tables when enabled.
- Local dev still uses `data/store.json` unchanged.
