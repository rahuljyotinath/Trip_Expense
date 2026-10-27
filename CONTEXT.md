# Trip Expenses Balancer

Shared trip ledger: roster nicknames, spends, equal splits, and cash settlement between people on a trip.

## Privacy

- Trip details are **not public**. APIs require sign-in; full ledger access only for roster members, trip creator, or someone presenting the trip **join code** (invite) until they claim a seat.
- Ledger data lives in **Postgres** in production — not in the git repo.

## Language

**Cover**:
The member who settles cash (owes or is owed) on behalf of another seat on the roster.
_Avoid_: payer, sponsor, guardian

**Covered member**:
A roster seat whose net cash position is borne by their cover; they still appear on bills and share splits.
_Avoid_: dependent (unless speaking to users), minor (UI copy only)

**Member**:
A nickname on a trip roster; may or may not be linked to a signed-in profile.
_Avoid_: user, participant

**Spend**:
One logged expense: date, amount, reason, who paid, who shared the bill.
_Avoid_: transaction, payment (use for paid-back only)
