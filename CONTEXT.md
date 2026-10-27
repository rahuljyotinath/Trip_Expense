# Trip Expenses Balancer

Shared trip ledger: roster nicknames, spends, equal splits, and cash settlement between people on a trip.

## Privacy

- Trip details are **not public**. APIs require sign-in; full ledger access for roster members, trip **admin** (creator), or—when the trip allows it—someone with a valid **join code** until they claim a seat. Trips with join approval require admin approval before claim.
- Ledger data lives in **Postgres** in production — not in the git repo.

## Language

**Trip admin**:
The profile that opened the trip (`createdByProfileId`). Sends email/phone invites and approves join requests.
_Avoid_: owner (unless user-facing)

**Join code**:
Six-letter code on a trip; primary way to find a trip and request or claim a seat.
_Avoid_: invite link (UI primary copy)

**Cover**:
The member who settles cash (owes or is owed) on behalf of another seat on the roster.
_Avoid_: payer, sponsor, guardian

**Covered member**:
A roster seat whose net cash position is borne by their cover; they still appear on bills and share splits.
_Avoid_: dependent (unless speaking to users), minor (UI copy only)

**Member**:
A nickname on a trip roster; may or may not be linked to a signed-in profile.
_Avoid_: user, participant

**Known contact**:
A profile you saved one-way (search, shared trip with both linked, or trip invite). They are not notified and do not see you unless they save you or you share a trip.
_Avoid_: friend, connection (implies mutual)

**Spend**:
One logged expense: date, amount, reason, who paid, who shared the bill.
_Avoid_: transaction, payment (use for paid-back only)
