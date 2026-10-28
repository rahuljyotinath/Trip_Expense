# ADR 0004: Trip admins and settings

## Status

Accepted

## Context

Trip configuration (details, roster nicknames, invites, join approvals) lived on the People tab and an edit modal, and only the trip creator could perform admin actions. Groups need delegated admins without sharing the creator account.

## Decision

- **`Group.adminProfileIds`**: optional list of profile ids with admin rights. The creator (`createdByProfileId`) is always an admin; normalize strips the creator from the stored list.
- **`isTripAdmin(group, profileId)`**: creator or listed in `adminProfileIds`.
- **Admin-only ops** (via `operations` + PATCH): `updateGroup`, `addMember`, `importTripCsv`, invite/join approval flows, `setTripAdmin`. Actor must be seated where `requireSeated` applies.
- **`setTripAdmin`**: actor admin; target must be a **linked** roster member (`member.profileId`); cannot revoke creator.
- **UI**: `/trip/[id]/settings` — admin-only page for trip details, add nicknames, delegate admins, invites and join requests. Chrome links **Trip settings** (and nav tab) for admins; People tab keeps roster, claim, cover, balances only.

## Consequences

- Non-admins cannot add nicknames or open settings even if they can edit their own spends.
- Multiple admins can manage invites and roster without creator credentials.
- Product language: **Trip admin** = creator or delegated admin (`CONTEXT.md`).
