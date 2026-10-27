# Trip Expenses Balancer

Group trip expenses. One person opens a trip and names the people. Everyone else makes a profile, enters the join code, and claims their name. Spends store date, amount, reason, payer, and who was on the bill — one person or everyone.

The ledger is one JSON document (`profiles` + `groups`). **Locally** it lives in `data/store.json`. **Production** uses **Supabase Postgres** when `POSTGRES_URL` is set (Vercel ↔ Supabase integration).

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217).

```bash
npm test
npm run build
```

## Publish (Vercel + Supabase)

Repo: [rahuljyotinath/Trip_Expense](https://github.com/rahuljyotinath/Trip_Expense)

1. Vercel → import `rahuljyotinath/Trip_Expense`, production branch **main**.
2. Connect **Supabase** (Storage / Database integration) so Vercel sets `POSTGRES_URL`.
3. In the Supabase SQL editor, run [`supabase/migrations/001_ledger_store.sql`](supabase/migrations/001_ledger_store.sql).
4. One-time import from a JSON file (default `data/store.json`; final GitHub snapshot in `data/backups/`):

```bash
POSTGRES_URL=... npm run db:import
# or: POSTGRES_URL=... npx tsx scripts/import-ledger-to-postgres.ts data/backups/github-store-20261027.json
```

5. Set `SESSION_SECRET` for sign-in cookies (recommended). On Vercel with `POSTGRES_URL`, the app can derive a session key if `SESSION_SECRET` is unset.
6. Deploy. `/api/health` should report `mode: "postgres"`, `connected: true`, and `sessionReady: true`.

Locally: copy `.env.example` to `.env.local`. Omit `POSTGRES_URL` to use `data/store.json` on disk.

Vercel’s `ignoreCommand` in [`vercel.json`](vercel.json) skips redeploys when a push only changes `data/`.

## How a trip works

1. **Sign up** with username + password, or **sign in** if you already have an account.
2. **Open a trip**: name it, list everyone. Share the invite link.
3. **Join**: paste the invite link, claim the name that is you.
4. Add a spend. Uncheck anyone who was not on that bill — split is equal among those checked.
5. Settle shows who pays whom. Mark a line **paid** when cash changes hands.
6. Edit or delete a spend you logged (or the trip opener can).

One currency per trip (INR by default). Roster names are nicknames — two Rahuls need two different labels.

## India GTM (internal)

Product and monetization notes (users stay free): [`docs/gtm/`](docs/gtm/).
