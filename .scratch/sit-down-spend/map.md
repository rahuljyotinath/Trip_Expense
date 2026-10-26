# Wayfinder map: sit-down + first spend

Label: `wayfinder:map`

## Destination

Throwaway, clickable UI prototypes of 2–3 full paths for **trip expense balancer** (UI may still say Waybill). Each path must make all three moments feel fast:

- Join link (`?join=CODE`) on a new phone
- Organizer opens a trip
- Return visit on the same browser (saved seat)

Pick a winner in the browser, then hand off to `/to-spec` — not implementation in this map.

## Notes

- Skills: `/prototype` (UI.md — `?variant=` on an existing route), `/grilling`, `/domain-modeling`
- Prototypes are throwaway; do not treat them as production UI
- User says "login"; product language is **seat**, **claim**, **spend** (no password today)
- Current app: [`src/components/waybill-app.tsx`](../../src/components/waybill-app.tsx); profile in `localStorage` via [`src/lib/client-api.ts`](../../src/lib/client-api.ts) (`waybill.profile`)
- Join link still hits name gate when no saved profile; first spend is a modal with date, amount, reason, payer, participants, equal/percent

## Decisions so far

<!-- one line per closed ticket: gist + link to issue file -->

## Not yet specified

- Product chrome: Waybill vs "trip expense balancer" in title and header
- Whether edit/cross-out of spends stays in the happy path or stays secondary
- Saving a spend while GitHub ledger is slow — spinner, optimistic UI, or queue
- Whether return visits skip home entirely or still show trip list
- Mobile keyboard / one-thumb entry for amount on join-from-link path

## Out of scope

- Vercel domain rename or project rename
- Changing GitHub file storage or `ledger` branch model
- Settle tab and paid-back flows (may appear as chrome in prototypes only)
- Real OAuth / phone OTP unless [What sit-down is](issues/02-sit-down-identity.md) chooses it

## Frontier (child tickets)

| # | Ticket | Type | Blocked by |
| --- | --- | --- | --- |
| 01 | [Path shapes for the prototype](issues/01-path-shapes.md) | grilling | — |
| 02 | [What sit-down is](issues/02-sit-down-identity.md) | grilling | — |
| 03 | [Click the variants](issues/03-click-variants.md) | prototype | 01, 02 |
| 04 | [Pick and freeze](issues/04-pick-and-freeze.md) | grilling | 03 |

Work one frontier ticket per session (except parallel research). First takeable: **01** or **02**.
