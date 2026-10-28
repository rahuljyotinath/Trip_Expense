# Wayfinder map: sell Tripzy

Label: `wayfinder:map`

## Destination

Frozen GTM spec in [`docs/gtm/ceo-spec.md`](../../docs/gtm/ceo-spec.md): who pays, job vs Splitwise, brand, site, product wedge, revenue targets. No marketing site or rebrand implementation in this map.

## Notes

- Product: Tripzy (package `waybill`); trip roster, join code, Cover, friends, INR default, WhatsApp invites
- Existing GTM: [`docs/gtm/b2b-pricing-one-pager.md`](../../docs/gtm/b2b-pricing-one-pager.md), [`design-partner-metrics.md`](../../docs/gtm/design-partner-metrics.md)
- Canvas: `canvases/tripzy-market-gtm.canvas.tsx` (market/competition draft)
- Round 1: user wanted **full Splitwise replacement** positioning; monetization was **undecided** → resolved as phased B2B-first (see 01)

## Decisions so far

- **Who pays:** Phased — operators Y1, Plus Y2+, users never pay for core split → [issues/01-who-pays.md](issues/01-who-pays.md)
- **Job we win:** Full-replacement positioning, phased product (trip-first Y1) → [issues/02-job-we-win.md](issues/02-job-we-win.md)
- **Beat definition:** Wedge + B2B bypass; India social-split niche → [issues/03-beat-definition.md](issues/03-beat-definition.md)
- **Brand:** Keep Tripzy, no rebrand → [issues/04-brand-lock.md](issues/04-brand-lock.md)
- **Site:** App home `/`; compare + operators routes later → [issues/05-site-vs-app.md](issues/05-site-vs-app.md)
- **Product wedge:** P0/P1/P2 table in ticket → [issues/06-product-wedge.md](issues/06-product-wedge.md)
- **Money model:** One-pager bands + Y1–Y3 ARR chase → [issues/07-money-model.md](issues/07-money-model.md)
- **CEO spec frozen** → [issues/08-freeze-spec.md](issues/08-freeze-spec.md), [`docs/gtm/ceo-spec.md`](../../docs/gtm/ceo-spec.md)

## Not yet specified

- Legal entity name on marketing site
- GST / invoicing for B2B
- Consumer subscription SKU naming

## Out of scope

- UPI implementation, landing page build, app rebrand
- Fundraising deck
- Ledger / domain model changes

## Frontier (child tickets)

| # | Ticket | Type | Status |
| --- | --- | --- | --- |
| 01 | [Who pays](issues/01-who-pays.md) | grilling | resolved |
| 02 | [Job we win](issues/02-job-we-win.md) | grilling | resolved |
| 03 | [Beat definition](issues/03-beat-definition.md) | grilling | resolved |
| 04 | [Brand lock](issues/04-brand-lock.md) | grilling | resolved |
| 05 | [Site vs app](issues/05-site-vs-app.md) | grilling | resolved |
| 06 | [Product wedge](issues/06-product-wedge.md) | grilling | resolved |
| 07 | [Money model](issues/07-money-model.md) | grilling | resolved |
| 08 | [Freeze spec](issues/08-freeze-spec.md) | task | resolved |

**Map closed.** Next work: implement `/vs-splitwise`, operator outbound, P1 product items — outside this wayfinder.
