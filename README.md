# Tripzy

Group trip expenses (Tripzy — user-facing brand; npm package `waybill`). One person opens a trip and names the people. Everyone **signs up**, enters the trip **join code**, and claims their roster nickname. Spends store date, amount, reason, payer, and who was on the bill.

**Production** stores all trip data in **Supabase Postgres** (`POSTGRES_URL`). **Never commit real ledger JSON** to git — use local `data/store.json` only for offline dev. Older repo commits may have contained a snapshot; live data stays in Postgres only.

**Privacy:** You only see trips you belong to (or open with a valid invite code until you claim a seat). Sign-in is required.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217).

To start the development server with automatic port selection, run `./start-server.command` on macOS or `start-server.cmd` on Windows. These launchers use port 43217 when available, choose another port when it is occupied, and report the URL in the terminal. Running a launcher again while the server is active reports the existing server. Keep the terminal open; press Ctrl+C to stop it.

```bash
npm test
npm run build
```

## Publish (Vercel + Supabase)

Repo: [rahuljyotinath/Trip_Expense](https://github.com/rahuljyotinath/Trip_Expense)

1. Vercel → import `rahuljyotinath/Trip_Expense`, production branch **main**.
2. Connect **Supabase** so Vercel sets `POSTGRES_URL`.
3. **Relational ledger (recommended):** with `POSTGRES_URL` in `.env.local` or the shell:

```bash
npm run db:migrate-relational
```

This applies [`001`](supabase/migrations/001_ledger_store.sql) + [`002`](supabase/migrations/002_relational_ledger.sql) if needed, then copies `ledger_store.data` into normalized tables. Or run SQL in Supabase, then `POSTGRES_URL=... npx tsx scripts/migrate-blob-to-relational.ts`.

4. **Legacy blob-only import** from a local JSON file (not in git):

```bash
POSTGRES_URL=... npm run db:import
```

5. Set `SESSION_SECRET` for sign-in cookies (recommended).
6. Deploy. `/api/health` should report `mode: "postgres"`, `connected: true`, after relational migration. Request `/api/health?stats=1` explicitly for `tripCount` and other ledger statistics.

Locally: copy `.env.example` to `.env.local`. Omit `POSTGRES_URL` to use `data/store.json` on disk.

### Preview deploy (second developer / branch)

Use one Vercel project with **scoped env vars** so production and preview use different databases:

| Variable | Production (`main`) | Preview (e.g. `features/security`) |
|----------|-------------------|-------------------------------------|
| `POSTGRES_URL` | Your Supabase URI | Friend’s Supabase URI |
| `SESSION_SECRET` | Your secret (≥32 chars) | Separate random secret |
| `NEXT_PUBLIC_APP_URL` | Production site URL | Preview `*.vercel.app` URL |

1. Friend: new Supabase project → `POSTGRES_URL=... npm run db:migrate-relational` (applies all `supabase/migrations/*.sql`).
2. Vercel → **Environment Variables** → set the three vars above for **Preview** only (leave Production unchanged).
3. Push the feature branch; open the Vercel **Preview** deployment URL. Confirm `/api/health` shows `mode: "postgres"`, `connected: true`.

Database query changes, timing logs, and the read-only connection check are documented in [Database performance](docs/database-performance.md).

## How a trip works

1. **Sign up** with username + password; complete profile (display name, email, phone).
2. **Open a trip** or **join with the join code** (six letters on the trip header). Shared links with `?join=` still work as a shortcut to that code.
3. **Claim** the nickname that is you on the roster.
4. Add spends; **Settle** shows who pays whom. Mark **paid** when cash changes hands.

One currency per trip (INR by default).

## Mobile (PWA, iOS, Android)

- **Install from browser:** PWA manifest + service worker (production build). See [docs/mobile-api.md](docs/mobile-api.md).
- **Capacitor apps:** [apps/mobile/README.md](apps/mobile/README.md) — WebView loads your deployed Tripzy URL.
- **Domain, deep links, store checklist:** [docs/mobile-production-domain.md](docs/mobile-production-domain.md), [docs/mobile-deeplinks.md](docs/mobile-deeplinks.md), [docs/mobile-store-checklist.md](docs/mobile-store-checklist.md).
- **Native (future):** [docs/mobile-native-phase3.md](docs/mobile-native-phase3.md).

Generate PNG home-screen icons: `npm run pwa:icons`.

## India GTM (internal)

Product notes: [`docs/gtm/`](docs/gtm/).
