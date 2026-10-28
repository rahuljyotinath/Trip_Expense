# Performance measurement (Tripzy)

## Ledger size (production)

`GET /api/health` includes **`ledgerDataBytes`** when `mode === "postgres"` (octet length of `ledger_store.data` JSON).

```bash
curl -sS "$APP_URL/api/health" | jq '{ mode, connected, ledgerDataBytes, ledgerVersion }'
```

If `ledgerDataBytes` is hundreds of KB or MB, full-blob PATCH/legacy reads dominate latency.

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
