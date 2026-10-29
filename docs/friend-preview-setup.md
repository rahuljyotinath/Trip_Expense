# Friend preview: separate Supabase + Vercel Preview URL

Use this when a second developer works on a branch (e.g. `features/security`) without touching production data.

## 1. Friend Supabase project

1. [Supabase dashboard](https://supabase.com/dashboard) → **New project** (empty; not the production project).
2. **Settings → Database → Connection string** → URI (pooler **Transaction** mode recommended for Vercel).
3. From repo root:

```bash
chmod +x scripts/provision-friend-database.sh
FRIEND_POSTGRES_URL='postgresql://...' ./scripts/provision-friend-database.sh
```

4. Confirm in Supabase **Table Editor**: `profiles`, `trips`, `auth_sessions`, etc.

## 2. Vercel Preview environment variables

Project: [trip-expense-balancer](https://vercel.com/rahuljyotinath-8458s-projects/trip-expense-balancer)

**Settings → Environment Variables** — add for **Preview** only (uncheck Production):

| Name | Value |
|------|--------|
| `POSTGRES_URL` | Friend’s Supabase URI from step 1 |
| `SESSION_SECRET` | `openssl rand -base64 32` (new secret, not production’s) |
| `NEXT_PUBLIC_APP_URL` | Preview URL after first deploy (see below) |

Redeploy the preview: **Deployments** → latest `features/security` preview → **Redeploy**.

Copy the preview hostname (e.g. `trip-expense-balancer-git-….vercel.app`), set `NEXT_PUBLIC_APP_URL` to `https://<that-host>`, redeploy again.

Production (`main`) keeps its own **Production** env vars unchanged.

## 3. Verify

```bash
curl -s "https://<preview-host>/api/health"
# mode: postgres, connected: true, sessionReady: true

curl -s "https://trip-expense-balancer-rahuljyotinath-8458s-projects.vercel.app/api/health"
# production should still show connected: true with production trip counts
```

## PR workflow

`main` is ruleset-protected. Push feature branches and open PRs; merge via GitHub.

Current security work: [PR #2](https://github.com/rahuljyotinath/Trip_Expense/pull/2).
