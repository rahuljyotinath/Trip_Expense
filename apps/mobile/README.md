# Tripzy — Capacitor (iOS & Android)

Native shells load the **hosted Tripzy web app** (same API + cookies as the browser).

## Prerequisites

- Node 20+
- **Android:** Android Studio, SDK
- **iOS:** Mac, Xcode, Apple Developer account (for device/TestFlight)
- Production URL with working login ([docs/mobile-production-domain.md](../../docs/mobile-production-domain.md))

## Setup

```bash
cd apps/mobile
npm install
export CAPACITOR_SERVER_URL=https://your-production-domain
npm run cap:sync
```

## Open native IDEs

```bash
npm run cap:open:android
npm run cap:open:ios
```

Build and run from Android Studio / Xcode. Test: login → home → trip → offline expense → sync.

## Config

- [`capacitor.config.ts`](capacitor.config.ts) — `appId` `com.tripzy.app`, `server.url` from env
- Deep links: edit [`public/.well-known/`](../../public/.well-known/) on the **web** deploy (Team ID, SHA-256)

## Store release

See [docs/mobile-store-checklist.md](../../docs/mobile-store-checklist.md).
