import type { Group } from "@/lib/types"

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatTripDates(group: Group) {
  const { startDate, endDate } = group
  if (!startDate && !endDate) return null
  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    const sameYear =
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start.getFullYear() === end.getFullYear()
    const startLabel = start.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    })
    return `${startLabel} – ${formatDay(endDate)}`
  }
  if (startDate) return `From ${formatDay(startDate)}`
  return `Until ${formatDay(endDate!)}`
}
