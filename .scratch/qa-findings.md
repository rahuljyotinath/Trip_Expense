# Production QA findings (2026-10-26)

**Prod URL:** https://trip-expense-balancer-rahuljyotinath-8458s-projects.vercel.app  
**DB:** `mode: postgres`, `connected: true`, `ledgerVersion: 2` (at start of QA)  
**QA trip (browser):** `g_fcb6e764e3aa66c3` — `[QA-TEMP] Browser week sim` (8 members, Mar 1–7 2026)

## Journey matrix (summary)

| Journey | Result |
|---------|--------|
| Sign in / session | Pass (Rahul on prod) |
| Home trip list | Pass |
| Open QA trip | Pass |
| Invite / copy link | Pass (control present) |
| Claim seat (2nd user) | Not run (single session) |
| Add spend | Partial (dialog; save blocked in automation viewport) |
| Edit spend | Not run |
| Delete spend | **Fail on prod before fix** (user report + code path) |
| Void expense | N/A — no UI |
| Settle / mark paid | Not run |
| People / cover | Not run |
| Trip edit dates | Pass (dates shown) |
| CSV import/export | Controls present, not exercised |
| Logged-out trip view | Pass (login CTAs after load) |
| Summary strip | Pass (₹0 on empty trip) |

## Ten problems

### 1. Delete spend reappears after remove (P0) — **FIXED in branch**

- **Repro:** Remove spend → briefly gone → returns after background refresh.
- **Cause:** `onReconciled` called `refresh()` → `fetchGroup` could overwrite server truth with cached ledger read.
- **Fix:** Drop post-success `refresh()`; sync `waybill.store` after PATCH; bust server load cache on GET trip.

### 2. Stale ledger on GET `/api/groups/[id]` (P1) — **FIXED**

- **Cause:** `readStore()` 3s in-process cache after concurrent writes.
- **Fix:** `connection()` + `invalidateLoadCache()` on GET by id.

### 3. Client `waybill.store` out of sync with Postgres (P1) — **FIXED**

- **Cause:** Online PATCH did not update localStorage preview base.
- **Fix:** `writeLocalStore(storeWithTrip(...))` after successful PATCH.

### 4. No test for optimistic delete preview (P2) — **FIXED**

- Added `previewGroupPatch delete-expense` test.

### 5. No delete-trip in product (P2) — **MITIGATED**

- Cannot remove QA trips from UI; use `npm run qa:purge` with `POSTGRES_URL`.

### 6. Void expense API exists, no UI (P2) — **OPEN**

- Users only hard-delete; crossed-out ledger pattern unavailable in UI.

### 7. POST `/api/groups` without session binding (P2) — **OPEN**

- `createdByProfileId` taken from body; should require session + match creator.

### 8. Open-trip roster: last nickname lost if Enter races submit (P3) — **OBSERVED**

- QA trip had 8 members, not 10 (Harper/Jordan timing).
- **Fix idea:** flush pending nickname before create.

### 9. Trip page flash “Not signed in” while session loads (P3) — **OBSERVED**

- Brief wrong header state on `/trip/[id]`.

### 10. No automated browser/E2E suite for journeys (P3) — **OPEN**

- Only `tsx --test` unit tests; prod regressions manual.

## Scripts added

- `npm run qa:seed` — Postgres seed (10 members, ~42 expenses)
- `npm run qa:purge` / `--dry-run` — remove `[QA-TEMP]*` groups

## Cleanup

Run after deploy verification:

```bash
POSTGRES_URL=... npm run qa:purge -- --dry-run
POSTGRES_URL=... npm run qa:purge
```

Removes browser-created trip and any script-seeded QA trips.
