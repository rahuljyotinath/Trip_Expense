# Deep links (Tripzy)

Base origin: **`NEXT_PUBLIC_APP_URL`** (see [mobile-production-domain.md](mobile-production-domain.md)).

## In-app paths

| Intent | Path | Notes |
|--------|------|--------|
| Home | `/` | Trip list after sign-in |
| Join by code (marketing) | `/?join=ABCD` | Uppercase code; redirects through login if needed |
| Trip desk | `/trip/{tripId}` | Ledger / settle / people tabs via `?tab=` |
| Join while viewing trip | `/trip/{tripId}?join=ABCD` | Claim roster seat |
| Trip settings | `/trip/{tripId}/settings` | Admins |
| Trip analytics | `/trip/{tripId}/analytics` | |
| Sign in | `/login?next={encodedPath}` | Preserves return URL |
| Sign up | `/signup?join=ABCD&next=...` | Trip onboarding |
| Profile setup | `/profile/setup?next=...` | After signup when name/email/phone incomplete |
| Public profile | `/profile/{username}` | |

Helpers: [`src/lib/trip-invite-url.ts`](../src/lib/trip-invite-url.ts), [`src/lib/navigation.ts`](../src/lib/navigation.ts).

## Universal links (Capacitor / native)

Replace `YOUR_DOMAIN` with your production host.

### iOS — `public/.well-known/apple-app-site-association`

Shipped as a template; set **`APPLE_TEAM_ID`** and **`CAPACITOR_APP_ID`** (e.g. `com.tripzy.app`) before enabling.

### Android — `public/.well-known/assetlinks.json`

Template included; add your Play signing **SHA-256** cert fingerprint.

### Capacitor

Use `@capacitor/app` `appUrlOpen` + `server.url` on your domain so the WebView receives the same paths as the browser.

## WhatsApp / share

Trip invite URLs are built with `tripJoinUrl(groupId, code, origin)` — always pass **`NEXT_PUBLIC_APP_URL`** as `origin` in production.
