# App Store & Play Store checklist (Phase 2 ops)

Engineering cannot complete these for you; track before public release.

## Accounts

- [ ] [Apple Developer Program](https://developer.apple.com/programs/) (~$99/yr)
- [ ] [Google Play Console](https://play.google.com/console) (~$25 one-time)
- [ ] Mac + Xcode (iOS builds) or Xcode Cloud

## Legal URLs (host on production domain)

- [ ] **Privacy policy** — live at `/privacy` on Tripzy
- [ ] Terms of service (recommended for paid features later)

## App metadata

- [ ] App name: **Tripzy**
- [ ] Short description: group trip expenses & settlements
- [ ] Category: Finance or Travel
- [ ] Screenshots: phone — home, trip ledger, settle tab, login
- [ ] App icon 1024×1024 (export from brand assets)

## Apple App Store Connect

- [ ] App privacy “nutrition labels” (username, trip amounts, email/phone if collected)
- [ ] Export compliance (standard encryption — HTTPS only usually “No” for ERN)
- [ ] TestFlight internal → external testers

## Google Play

- [ ] Data safety form (align with privacy policy)
- [ ] App signing key (Play App Signing recommended)
- [ ] Internal testing track → production

## Capacitor build

See [apps/mobile/README.md](../apps/mobile/README.md): set `CAPACITOR_SERVER_URL`, `cap sync`, open Android Studio / Xcode.

## QA on real devices

- [ ] Login → session persists after app restart
- [ ] Join code deep link
- [ ] Add expense offline → sync when online
- [ ] Logout clears session
