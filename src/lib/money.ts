export function toPaise(amount: number) {
  return Math.round(amount * 100)
}

export function fromPaise(paise: number) {
  return paise / 100
}

export function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function parseAmount(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null
  return Math.round(value * 100) / 100
}
