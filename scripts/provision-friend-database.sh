#!/usr/bin/env bash
# Apply all supabase/migrations/*.sql to a fresh Postgres (friend preview Supabase project).
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${FRIEND_POSTGRES_URL:-}" ]]; then
  echo "Create a new Supabase project (separate from production)."
  echo "Copy Settings → Database → Connection string (URI, pooler transaction mode)."
  echo ""
  echo "Then run:"
  echo "  FRIEND_POSTGRES_URL='postgresql://...' ./scripts/provision-friend-database.sh"
  exit 1
fi
POSTGRES_URL="$FRIEND_POSTGRES_URL" npm run db:migrate-relational -- --sql-only
echo "Done. Use this URI as Vercel Preview-only POSTGRES_URL."
