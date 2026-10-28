# Phase 3 — Native app (Expo / React Native)

Optional path if Capacitor WebView is insufficient (push, camera, heavy offline).

## Backend (done / planned in web repo)

- **Bearer auth**: `Authorization: Bearer {sessionToken}` on all authenticated routes via [`sessionProfileId()`](../src/lib/session.ts).
- **Login/signup** return **`sessionToken`** for secure storage on device.

## Extract shared package (future)

Move to `packages/shared/`:

- [`src/lib/types`](../src/lib/types.ts)
- [`operations`](../src/lib/operations.ts), settlement/ledger math
- Pure helpers from [`trip-contacts`](../src/lib/trip-contacts.ts), [`trip-invites`](../src/lib/trip-invites.ts)

Keep **network + storage** in mobile-only `api-client.ts` (AsyncStorage, outbox port of [`offline-outbox.ts`](../src/lib/offline-outbox.ts)).

## Mobile app shell

- Expo SDK, React Navigation
- Screens: login, home trip list, trip desk (tabs), profile setup
- Deep links: same paths as [mobile-deeplinks.md](mobile-deeplinks.md)

## Not in scope until product asks

- Push (FCM/APNs) — needs backend sender + store entitlements
- Full UI parity with [`waybill-app.tsx`](../src/components/waybill-app.tsx) — largest cost
