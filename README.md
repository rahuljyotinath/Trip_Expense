# Trip Expenses Balancer

Group trip expenses. One person opens a trip and names the people. Everyone **signs up**, uses the invite link, and claims their name. Spends store date, amount, reason, payer, and who was on the bill.

**Production** stores all trip data in **Supabase Postgres** (`POSTGRES_URL`). **Never commit real ledger JSON** to git — use local `data/store.json` only for offline dev. Older repo commits may have contained a snapshot; live data stays in Postgres only.

**Privacy:** You only see trips you belong to (or open with a valid invite code until you claim a seat). Sign-in is required.

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
2. Connect **Supabase** so Vercel sets `POSTGRES_URL`.
3. In the Supabase SQL editor, run [`supabase/migrations/001_ledger_store.sql`](supabase/migrations/001_ledger_store.sql).
4. One-time import from a **local** JSON file (not in git):

```bash
POSTGRES_URL=... npm run db:import
# or: POSTGRES_URL=... npx tsx scripts/import-ledger-to-postgres.ts path/to/store.json
```

5. Set `SESSION_SECRET` for sign-in cookies (recommended).
6. Deploy. `/api/health` should report `mode: "postgres"`, `connected: true`, and `sessionReady: true`.

Locally: copy `.env.example` to `.env.local`. Omit `POSTGRES_URL` to use `data/store.json` on disk.

## How a trip works

1. **Sign up** with username + password; complete profile (display name, email, phone).
2. **Open a trip** or **join** via invite link (`?join=` code on the trip URL).
3. **Claim** the nickname that is you on the roster.
4. Add spends; **Settle** shows who pays whom. Mark **paid** when cash changes hands.

One currency per trip (INR by default).

## India GTM (internal)

Product notes: [`docs/gtm/`](docs/gtm/).
