# Tripzy HTTP API (mobile clients)

All routes live under **`/api/*`** on the app origin. Send **`Content-Type: application/json`**.

## Authentication

| Method | Use |
|--------|-----|
| **Cookie** | Browser, PWA, Capacitor WebView on the same origin: `credentials: "include"`. Cookie name: `teb_session` (httpOnly). |
| **Bearer** | Native apps (Phase 3): `Authorization: Bearer {sessionToken}`. Token format matches the session cookie value. |

Obtain token: **`POST /api/auth/login`** or **`POST /api/auth/signup`** response includes optional **`sessionToken`** (store in Keychain/Keystore; do not log).

Session check: **`GET /api/auth/session`** → `{ profile: PublicProfile | null }`.

Sign out: **`POST /api/auth/logout`**.

## Health

**`GET /api/health`** — no auth.

Response (partial): `{ mode, connected, warning, error, sessionReady, tripCount, profileCount, ... }`.

## Auth

| Route | Method | Body | Success |
|-------|--------|------|---------|
| `/api/auth/login` | POST | `{ username, password }` | `{ profile, sessionToken? }` |
| `/api/auth/signup` | POST | `{ username, password, name? }` | `{ profile, sessionToken? }` |
| `/api/auth/session` | GET | — | `{ profile }` |
| `/api/auth/logout` | POST | — | `{ ok: true }` |

Errors: `{ error: string }`, status 401/503.

## Profile

| Route | Method | Body | Success |
|-------|--------|------|---------|
| `/api/profile` | GET | — | `{ profile }` |
| `/api/profile` | PATCH | `{ name?, email?, phone? }` | `{ profile }` |
| `/api/profiles?id=` | GET | query `id` | `{ profile }` |
| `/api/profiles/view?username=` | GET | | `{ profile }` |
| `/api/profiles/preview?q=` | GET | @user, email, or phone | `{ profile }` |

## Trips (groups)

| Route | Method | Query / body | Success |
|-------|--------|--------------|---------|
| `/api/groups?profileId=` | GET | session must match profileId | `{ groups: Group[] }` |
| `/api/groups?code=` | GET | join lookup | `{ group, joinRequest }` |
| `/api/groups` | POST | create trip payload | `{ group }` |
| `/api/groups/{id}` | GET | optional `?join=CODE` | Trip payload (group, linkedProfiles, invites, …) |
| `/api/groups/{id}` | PATCH | `{ action, ... }` | `{ group }` |

PATCH **`action`** values include: `add-expense`, `add-payment`, `claim`, `request-join`, `update-expense`, `delete-expense`, `void-expense`, `void-payment`, `update-group`, `import-csv`, `send-trip-invite`, etc. See [`src/app/api/groups/[id]/route.ts`](../src/app/api/groups/[id]/route.ts).

Idempotency: include **`clientOpId`**, **`expenseId`**, **`paymentId`** on add actions (web client uses [`withClientPatchIds`](../src/lib/offline-outbox.ts)).

## Contacts & invites

| Route | Method | Success |
|-------|--------|---------|
| `/api/contacts` | GET | `{ contacts }` |
| `/api/contacts` | POST | add/remove contact |
| `/api/trip-invites` | GET | `{ invites }` |
| `/api/trip-invites` | POST | accept/decline invite |

## Client offline (web today)

- Profile cache + trip snapshots: browser `localStorage` keys `waybill.profile`, `waybill.store`.
- Pending PATCH queue: `waybill.outbox`.
- Native apps should mirror this pattern with AsyncStorage/SQLite ([mobile-native-phase3.md](mobile-native-phase3.md)).

## Errors

- **401** — `Sign in again.`
- **403** — forbidden trip access
- **404** — trip/profile not found
- **503** — `unconfigured` or database unreachable
