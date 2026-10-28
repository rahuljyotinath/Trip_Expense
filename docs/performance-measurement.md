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

Auth and list endpoints use **indexed single-row** or **scoped** reads (login by username, contacts by owner, trip mutations without loading every profile).

## Browser (trip open)

1. DevTools → Network.
2. From **home**, click a trip (after trips list loaded).
3. **Expected (warm):**
   - Ledger visible **before** `/api/groups/<id>` finishes (local snapshot from home list).
   - **Parallel** `/api/auth/session` + `/api/groups/<id>` — no required `/api/health` on trip route.
   - First paint should not wait on a second full trip fetch if home already loaded that trip.
4. Cold `/trip/<id>` (no prior home): note TTFB on session + groups GET only.
5. Add a spend → **TTFB** on `PATCH /api/groups/<id>`.

## Vercel

Filter function logs by `/api/groups/` and `/api/health`; compare cold vs warm duration.

## Home boot

After sign-in, groups, trip-invites, and contacts should load in **parallel** (three concurrent requests, not serial).
