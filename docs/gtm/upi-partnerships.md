# UPI settlement — product spec and partnerships

## In-app behavior (shipped)

- **Settle** transfer rows: **Pay via UPI** when you are the payer (`fromMemberId`).
- **Ledger** paid-back cards: same, for the payer side of that payment.
- User enters payee **UPI ID (VPA)** once; stored in browser `localStorage` per member id (`recalledMemberUpiVpa`).
- Opens `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` — no money movement inside Waybill.

Implementation: [`src/lib/upi-pay.ts`](../../src/lib/upi-pay.ts), [`src/components/trip/upi-settle-button.tsx`](../../src/components/trip/upi-settle-button.tsx).

## VPA validation

Light regex only; user responsible for correct ID. Future: optional VPA on member roster (server field).

## Partnership outreach shortlist (no user fee)

| Partner type | Examples | Ask |
|--------------|----------|-----|
| PSP co-marketing | PhonePe, Google Pay, Paytm | Intent link docs, co-branded “settle trip” campaign |
| Bharat BillPay / NPCI ecosystem | BBPOU partners | Education on trip use case |
| Neobanks | Jupiter, Fi | Young traveler co-marketing |
| Corporate travel | Happay, Zaggle | B2B settle after offsite |

Revenue: **referral / B2B**, not per-user fee. Disclose in privacy policy when co-branded.

## Compliance

- Waybill is not a PA/PG; deep links only.
- Do not store VPA on server until DPDP consent copy exists.
