import { sharesComplete } from "@/lib/shares"
import { normalizeGroup, type Group } from "@/lib/types"
import type { ParsedTripCsv } from "@/lib/trip-csv"

export const TRIP_JSON_FORMAT = "tripzy-trip"
export const TRIP_JSON_VERSION = 1

export function exportTripJson(group: Group): string {
  const { name, currency, startDate, endDate, members, expenses, payments, ledgerDayOrder } = normalizeGroup(group)
  return JSON.stringify({ format: TRIP_JSON_FORMAT, version: TRIP_JSON_VERSION,
    trip: { name, currency, startDate, endDate }, members, expenses, payments, ledgerDayOrder }, null, 2) + "\n"
}

export function parseTripJson(text: string): ParsedTripCsv & Pick<Group, "ledgerDayOrder"> {
  let data
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")) } catch { throw new Error("Invalid JSON file.") }
  const fail = () => { throw new Error("Invalid trip JSON data. Use a Tripzy JSON export.") }
  if (!data || data.format !== TRIP_JSON_FORMAT || data.version !== TRIP_JSON_VERSION) {
    throw new Error("Unrecognized trip JSON format or version.")
  }
  const string = (v: unknown) => typeof v === "string" && v.trim().length > 0
  const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  const nullableString = (v: unknown) => v === null || string(v)
  if (!data.trip || !string(data.trip.name) || !/^[A-Z]{3}$/.test(data.trip.currency) ||
    !(data.trip.startDate === null || date(data.trip.startDate)) ||
    !(data.trip.endDate === null || date(data.trip.endDate)) ||
    !Array.isArray(data.members) || !data.members.length || !Array.isArray(data.expenses) || !Array.isArray(data.payments)) fail()
  const ids = new Set<string>()
  for (const m of data.members) {
    if (!m || !string(m.id) || ids.has(m.id) || !string(m.name) || !nullableString(m.profileId) || !nullableString(m.coveredByMemberId)) fail()
    ids.add(m.id)
  }
  for (const m of data.members) {
    const seen = new Set([m.id])
    let cover = m.coveredByMemberId
    while (cover !== null) {
      if (!ids.has(cover) || seen.has(cover)) fail()
      seen.add(cover)
      cover = data.members.find((item: { id: string }) => item.id === cover).coveredByMemberId
    }
  }
  const entryIds = new Set<string>()
  for (const entry of [...data.expenses, ...data.payments]) {
    if (!entry || !string(entry.id) || entryIds.has(entry.id) || !date(entry.date) ||
      typeof entry.amount !== "number" || !Number.isFinite(entry.amount) || entry.amount <= 0 ||
      typeof entry.createdByProfileId !== "string" || !string(entry.createdAt) ||
      !nullableString(entry.voidedAt) || !nullableString(entry.voidedByProfileId)) fail()
    entryIds.add(entry.id)
  }
  for (const e of data.expenses) {
    if (!string(e.reason) || !ids.has(e.paidByMemberId) || !Array.isArray(e.participantIds) || !e.participantIds.length ||
      new Set(e.participantIds).size !== e.participantIds.length || e.participantIds.some((id: string) => !ids.has(id)) ||
      !["equal", "percent"].includes(e.split) || !e.shares || typeof e.shares !== "object" || Array.isArray(e.shares) ||
      (e.split === "percent" && !sharesComplete(e.participantIds, e.shares))) fail()
  }
  for (const p of data.payments) {
    if (!ids.has(p.fromMemberId) || !ids.has(p.toMemberId) || p.fromMemberId === p.toMemberId) fail()
  }
  const order = data.ledgerDayOrder
  if (order !== undefined) {
    if (!order || typeof order !== "object" || Array.isArray(order)) fail()
    for (const [day, entries] of Object.entries(order)) {
      if (!date(day) || !Array.isArray(entries) || new Set(entries).size !== entries.length || entries.some(id =>
        ![...data.expenses, ...data.payments].some(e => e.id === id && e.date === day))) fail()
    }
  }
  return { trip: { name: data.trip.name, currency: data.trip.currency, startDate: data.trip.startDate, endDate: data.trip.endDate },
    members: data.members, expenses: data.expenses, payments: data.payments, ledgerDayOrder: order }
}

export function downloadTripJsonFile(group: Group) {
  const url = URL.createObjectURL(new Blob([exportTripJson(group)], { type: "application/json;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip"}-${group.code}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
