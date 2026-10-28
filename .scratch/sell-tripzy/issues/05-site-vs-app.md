Status: resolved
Type: grilling
Blocked by: 04

# Site vs app

## Question

Public web presence:

- **A** — Marketing landing at `/` (or `www`) + app at `/login` or subdomain.
- **B** — Current pattern: app home is `/`; add `/compare`, `/for-operators` only.
- **C** — Minimal: `/privacy` + App Store / PWA; no marketing site until 10k MAU.

Required sections if marketing exists: hero, Splitwise compare, operators, trust, CTA.

## Answer

**B for Y1 implementation order** (this map still does not build pages).

- `/` stays **app home** (create trip / join).
- Add **static routes** when copy freezes (post-spec): `/vs-splitwise`, `/for-operators`, `/privacy`, `/terms`.
- No separate marketing domain or `www` split until MAU > 10k or paid ads need a landing.
- **Hero content** lives on `/vs-splitwise` first (SEO + shareable compare), not a full marketing homepage takeover.

Required sections when built: hero, Splitwise compare table, operators pricing bands (link one-pager), trust (data export, no ads), CTA → create trip.
