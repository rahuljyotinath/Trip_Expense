# Tripzy GTM spec (CEO)

Frozen after wayfinder grill: [`.scratch/sell-tripzy/map.md`](../../.scratch/sell-tripzy/map.md). **Implementation of marketing site / Plus / product gaps is separate work.**

## One-liner

**Tripzy** — the Splitwise alternative for how Indians split: trips, dinners, and ad-hoc groups — unlimited, no ads, WhatsApp-native. **Operators pay in Y1;** travelers stay free.

## Who pays

| Phase | Payer | Model |
|-------|--------|--------|
| Y1 | Trek, wedding, corporate, college sponsors | B2B bands in [b2b-pricing-one-pager.md](./b2b-pricing-one-pager.md) |
| Y2+ | Optional **Tripzy Plus** (power users) | ₹499 intro → ₹799/yr; never paywall basic split/settle |
| Always | End users on operator trips | Free |

## Job vs Splitwise

- **Positioning:** full Splitwise **alternative** (trips, households, dinners, IOUs).
- **Y1 product:** trip-native ledger (roster, join, Cover, settle, INR, equal/percent) covers most **social** splits; market ad-hoc groups inside a trip container.
- **Roadmap for parity:** standing groups (P1), UPI settle links (P1), multi-currency (P2), recurring bills (P2), receipt scan (out Y1).

## What “beat Splitwise” means

Primary: **monetize wedge** (no 4/day cap, no ads) + **B2B bypass** (operators standardize invites/roster/export).

**Y1 targets:** 5–10 paying operators, ~3k India MAU, 60% trips with ≥3 group spends, 20 switch stories.

Not Y1: global MAU displacement or App Store #1 vs Splitwise.

## Brand

- Customer-facing name: **Tripzy** only (drop “Waybill” in outbound copy).
- Visual: terracotta / moss ledger tokens — no rebrand.
- Voice: neutral English, India examples (₹, UPI, WhatsApp). Tagline draft: *Split trips and groups without Splitwise limits.*

## Web

- Y1: app at `/`; add `/vs-splitwise`, `/for-operators`, legal pages when built — **not** a separate marketing homepage yet.
- Compare page carries hero + operator CTA first.

## Product wedge (12 months)

**P0 (ship / maintain):** unlimited spends, no ads, WhatsApp, roster/join, splits, settle, INR, CSV.

**P1:** UPI deep-link settle, standing groups, split UI polish from pilot feedback.

**P2:** multi-currency, recurring bills.

**Out Y1:** receipt OCR.

## Revenue chase

| Year | Focus | ARR target |
|------|--------|------------|
| Y1 | Operator contracts + design-partner proof | ~₹8L |
| Y2 | Scale operators + Plus launch | ~₹45L |
| Y3 | Operators + Plus mix | ~₹1.4Cr |

Details: [07-money-model.md](../../.scratch/sell-tripzy/issues/07-money-model.md).

## Related docs

- [B2B pricing one-pager](./b2b-pricing-one-pager.md)
- [Design partner metrics](./design-partner-metrics.md)
- Market draft: `canvases/tripzy-market-gtm.canvas.tsx`

## Open (not blocking GTM copy)

- Legal entity name on site
- GST / B2B invoicing
- Plus SKU final naming
