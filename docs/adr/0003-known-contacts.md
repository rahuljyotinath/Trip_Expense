# ADR 0003: Known contacts

## Status

Accepted

## Context

Trip **members** are roster nicknames on one trip. Users also need a personal, reusable list of people they know across trips—for invites and quick lookup—without implying mutual friendship or global directory search.

## Decision

- **Known contact** = one-way row: `ownerProfileId` saved `targetProfileId` with `source`: `search` | `trip` | `invite`.
- Stored in ledger JSON as **`Store.contacts`**; unique on `(ownerProfileId, targetProfileId)` via idempotent upsert.
- **Trip source:** when two distinct **linked** profiles share a trip, upsert **both** directions with `source: trip` (after claim / sync).
- **Search source:** exact match only on `@username`, email, or phone (same normalizers as auth and invites). No fuzzy or browse API.
- **Invite source:** when trip admin sends an invite and the email/phone resolves to an existing profile, optionally upsert admin → target.
- List API returns public profile fields only (never `passwordHash`).
- Search-add is **online-only** for v1; no offline outbox for contacts.

## Consequences

- Contacts do not auto-notify the other person.
- Distinct from **Member** (trip roster nickname) in product copy (`CONTEXT.md`).
- Admin invite UI can prefill from contacts; non-users still invited by email/phone only.
