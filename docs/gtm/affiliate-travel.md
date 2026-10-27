# Optional travel module — UX and affiliates

## UX (in app)

- **Removed:** desk travel affiliate UI (component deleted); env vars for affiliates unused until reintroduced.
- Opt-in: collapsed by default; dismiss per trip (`sessionStorage`).
- Copy: optional booking links; **never blocks** ledger / settle.
- Affiliate IDs: set when partnerships exist; until then generic search URLs.

## Partner shortlist (India)

| Category | Partners | Model |
|----------|----------|--------|
| Hotels + flights | MakeMyTrip, Goibibo, Cleartrip | Affiliate commission |
| Buses | RedBus, AbhiBus | Affiliate |
| Trains | IRCTC (official app link only) | No scrape; deep link |
| Trek / activities | Thrillophilia, IndiaHikes | Lead / affiliate |
| Insurance | ACKO, Digit travel | Affiliate |

## Consent

Before using trip name for prefilled search: user clicks partner link explicitly. Future: DPDP checkbox if metadata used for personalization.

## Env (optional later)

- `NEXT_PUBLIC_AFFILIATE_MMT` — append to MMT URL template
- `NEXT_PUBLIC_AFFILIATE_REDBUS` — same
