# Database performance

Trip reads keep the existing complete `Group` API payload and offline snapshots.
Trip-list reads use one SQL statement with indexed per-trip aggregates. Saves
compare rows by ID and write only changed rows, inside the existing versioned
transaction. New roster members are written before cover links are applied.
Metadata updates retain the global version check and update only changed rows.

`/api/health` checks connectivity without counting all ledger tables or measuring
the legacy JSON blob. Its existing statistics fields are present with `null`
values. Request `/api/health?stats=1` when those diagnostics are needed.

## Hosted measurements

Set `LEDGER_PERF_LOG=1` for a preview deployment to emit `ledger_performance` JSON
logs for `groups.list`, `trip.read`, and `trip.save`. Entries contain status,
request duration, database duration, application query count, detected backend,
and Vercel execution region. SQL text, query parameters, connection URLs, profile
IDs and ledger content are excluded. Successful and handled error responses also
include `Server-Timing` with `app` and `db` durations.

`databaseMs` sums awaited application statement durations, including connection
and pool wait. Parallel queries can make this exceed the request duration.
`queryCount` excludes driver-generated BEGIN/COMMIT/ROLLBACK statements and SQL
helpers. It includes retries and backend detection when applicable.

Use identical synthetic trips on the baseline and updated preview deployments:

1. Use 10 trips of 100 spends, with the same signed-in roster profile.
2. Record the first request after an idle period separately from at least 20
   subsequent requests for the home list, a trip, and a one-spend edit. Retain
   median and p95 timings, query counts, and HTTP status. Do not clear real data.
3. Check that contacts, invites, and health requests completing slowly do not
   delay the trip list. Health warnings must still render when available.
4. Verify cached trip navigation, a spend edit, an offline edit followed by
   reconnect, and trip access denial for an unrelated signed-in profile.

There is no shared cache of private API responses and no schema migration for
this change. Rollback is a code deployment; the existing relational rows remain
compatible.

## Connection and region checks

With the deployment's database environment loaded, run `npm run db:diagnose`.
This performs only SELECT statements. It reports the detected backend, connection
mode, configured pool maximum, prepared-statement and TLS settings, and first and
warm SELECT durations. It never prints the URL, hostname, username, or password.
A Supabase pooler hostname may provide a database region hint; verify that hint
against the Supabase project dashboard. Direct database hosts do not encode their
region, so their hint is `null`. Run from the deployed environment to measure its
network path; a local run describes the local connection only.

Compare the execution region from the performance logs with the Supabase project
region and the Vercel function region settings. Confirm whether the deployed
`LEDGER_BACKEND` override matches the reported backend and whether the configured
connection URL uses the intended pooler. Do not change regions, pool sizes, or
connection mode without these measurements.

Production credentials and hosting settings were not present in this workspace;
no hosted measurements or region checks have been performed here.

## Local regression evidence

The tests use PGlite (Postgres in WASM) with the repository's real SQL migrations.
They exercise the SQL, foreign keys, atomic rollback, version conflicts,
metadata diffs, and isolation between trips. Existing offline replay tests remain
part of `npm test`.

A local comparison against the pre-change repository used identical synthetic
fixtures: 10 trips, 100 spends per trip, one first invocation followed by five
warm invocations. Counts exclude transaction control statements.

| Operation | Statements before → after | First duration before → after | Warm mean before → after |
| --- | --- | --- | --- |
| Trip list | 51 → 1 | 16.93 → 12.95 ms | 17.58 → 10.78 ms |
| One-spend edit, including reads | 121 → 12 | 17.45 → 3.88 ms | 15.84 → 3.33 ms |

These local timings include no database network latency and are not predictions
for hosted cold starts. Regression tests additionally verify that one-spend edits
perform exactly two writes with both 3 and 100 spends.
