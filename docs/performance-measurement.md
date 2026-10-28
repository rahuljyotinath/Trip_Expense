# Performance measurement (Tripzy)

## Ledger size (production)

`GET /api/health` when `mode === "postgres"`:

- **`ledgerDataBytes`** — legacy blob size (if `ledger_store` row still present)
- **`profileCount`**, **`tripCount`**, **`expenseCount`**, **`paymentCount`** — relational ledger (after migration 002)

```bash
curl -sS "$APP_URL/api/health" | jq '{
  mode, connected, ledgerVersion,
  ledgerDataBytes, tripCount, expenseCount
}'
```

Relational mode: PATCH cost scales with **one trip’s** expense/payment rows, not `ledgerDataBytes`.

## Browser (trip open)

1. DevTools → Network, disable cache.
2. Open `/trip/<id>`.
3. Note **TTFB** and count for:
   - `/api/health`
   - `/api/auth/session` (if separate)
   - `/api/groups/<id>` (should be one trip payload; no extra `/api/trip-invites` on trip page for viewer invite banner)
4. Add a spend → **TTFB** on `PATCH /api/groups/<id>`.

## Vercel

Filter function logs by `/api/groups/` and `/api/health`; compare cold vs warm duration.

## Home boot

After sign-in, groups, trip-invites, and contacts should load in **parallel** (three concurrent requests, not serial).
