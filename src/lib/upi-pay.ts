/** NPCI-style UPI intent URI (opens GPay / PhonePe / Paytm). */
export function buildUpiPayUri(input: {
  vpa: string
  payeeName: string
  amount: number
  currency?: string
  note?: string
}) {
  const vpa = input.vpa.trim().toLowerCase()
  const params = new URLSearchParams()
  params.set("pa", vpa)
  params.set("pn", input.payeeName.trim().slice(0, 50))
  params.set("am", input.amount.toFixed(2))
  params.set("cu", input.currency ?? "INR")
  const note = input.note?.trim()
  if (note) params.set("tn", note.slice(0, 80))
  return `upi://pay?${params.toString()}`
}

export function isLikelyUpiVpa(vpa: string) {
  return /^[\w.-]{2,256}@[\w.-]{2,64}$/i.test(vpa.trim())
}

const VPA_STORAGE_PREFIX = "waybill-upi-vpa:"

export function rememberMemberUpiVpa(memberId: string, vpa: string) {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(`${VPA_STORAGE_PREFIX}${memberId}`, vpa.trim().toLowerCase())
  } catch {
    /* quota / private mode */
  }
}

export function recalledMemberUpiVpa(memberId: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(`${VPA_STORAGE_PREFIX}${memberId}`)
  } catch {
    return null
  }
}
