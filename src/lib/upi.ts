const UPI_VPA_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$/

export function normalizeUpiId(raw: string) {
  return raw.trim().toLowerCase()
}

export function validateUpiId(raw: string | null | undefined) {
  const value = normalizeUpiId(raw ?? "")
  if (!value) return null
  if (!UPI_VPA_RE.test(value)) {
    throw new Error("UPI ID looks wrong — use name@bank (e.g. rahul@okicici).")
  }
  if (value.length > 320) throw new Error("UPI ID is too long.")
  return value
}

export function formatUpiAmount(amount: number) {
  return amount.toFixed(2)
}

export type UpiPayParams = {
  payeeAddress: string
  payeeName: string
  amount: number
  note: string
}

export function buildUpiPayUrl(input: UpiPayParams) {
  const pa = normalizeUpiId(input.payeeAddress)
  if (!pa) throw new Error("Payee UPI ID is missing.")
  const params = new URLSearchParams({
    pa,
    pn: input.payeeName.slice(0, 80),
    am: formatUpiAmount(input.amount),
    cu: "INR",
    tn: input.note.slice(0, 80),
  })
  return `upi://pay?${params.toString()}`
}

export function upiIdForMemberProfile(
  linkedProfiles: Array<{ profileId: string; upiId?: string | null }>,
  profileId: string | null | undefined
) {
  if (!profileId) return null
  const row = linkedProfiles.find((item) => item.profileId === profileId)
  const id = row?.upiId?.trim()
  return id ? normalizeUpiId(id) : null
}
