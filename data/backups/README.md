# Ledger backups (local only)

Do **not** commit real ledger JSON to git. Use this folder for one-off exports on your machine.

Restore to local dev: copy a backup to `data/store.json`. Import to Postgres:

`POSTGRES_URL=... npx tsx scripts/import-ledger-to-postgres.ts path/to/your-export.json`
