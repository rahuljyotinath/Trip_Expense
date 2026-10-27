# ADR 0002: Trip invites and join approval

## Status

Accepted

## Context

Joining must work with a **join code** and roster **nickname claim**. Admins (trip creators) need to invite people by **email or phone**, and to **approve** code-based join requests before newcomers claim a seat.

## Decision

- **Trip admin** = `Group.createdByProfileId`.
- Store-level **`tripInvites`** and **`joinRequests`** arrays in the ledger JSON (same blob as groups/profiles).
- **`TripInvite`**: admin sends email and/or phone; invitee sees pending invites on home; accept/decline updates invite status. Accept creates an **approved** `JoinRequest` so the invitee can claim a nickname.
- **`JoinRequest`**: created when a user requests to join via code on trips with **`joinApprovalRequired`** (default **true** for newly created trips). Admin approves or rejects on the People tab. After **approved**, user picks an open roster nickname (`claimMember`). No ledger write access until seated.
- **`canViewGroup`**: join code alone does **not** grant trip GET access when approval is required unless the viewer has an **approved** join request or is already a member/admin.

## Consequences

- New trips require admin approval for code joins; existing trips without the flag behave as before (`joinApprovalRequired` normalized to `false`).
- Invite matching uses normalized email/phone on `Profile` (same rules as profile setup).
- Offline outbox must include new PATCH actions for invites and join requests.
