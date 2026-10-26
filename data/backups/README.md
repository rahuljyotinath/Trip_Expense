# Ledger backups

Final GitHub file-ledger snapshot before Postgres-only storage (2026-10-27):

- `github-store-20261027.json` — downloaded from `data/store.json` on `main` via GitHub API.

Restore to local dev: copy to `data/store.json`. Import to Postgres: `POSTGRES_URL=... npm run db:import`.
