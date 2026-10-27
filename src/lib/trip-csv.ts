import { uid } from "@/lib/ids"
import { normalizeGroup, type Expense, type Group, type Member, type Payment } from "@/lib/types"

export const TRIP_CSV_FORMAT = "waybill-trip-csv"
export const TRIP_CSV_VERSION = "2"
/** @deprecated v1 wide-table format; still accepted on import */
export const TRIP_CSV_VERSION_LEGACY = "1"

const V1_COLUMNS = [
  "record",
  "id",
  "name",
  "code",
  "currency",
  "start_date",
  "end_date",
  "created_at",
  "created_by_profile_id",
  "profile_id",
  "covered_by_member_id",
  "date",
  "amount",
  "reason",
  "paid_by_member_id",
  "participant_ids",
  "split",
  "shares_json",
  "from_member_id",
  "to_member_id",
  "voided_at",
  "voided_by_profile_id",
] as const

type CsvRow = Partial<Record<(typeof V1_COLUMNS)[number], string>>

function escapeCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function rowLine(cells: string[]) {
  return cells.map((raw) => (raw ? escapeCell(raw) : "")).join(",")
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function tableToObjects(table: string[][]): Record<string, string>[] {
  if (table.length < 2) return []
  const header = table[0]!.map((h) => h.trim())
  return table.slice(1).map((cells) => {
    const row: Record<string, string> = {}
    header.forEach((key, i) => {
      const value = cells[i]?.trim()
      if (value) row[key] = value
    })
    return row
  })
}

function memberNameById(group: Group, memberId: string) {
  return group.members.find((m) => m.id === memberId)?.name ?? memberId
}

function voidedLabel(at: string | null) {
  return at ? "yes" : "no"
}

function parseVoided(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v === "yes" || v === "y" || v === "true" || v === "1") {
    return new Date(0).toISOString()
  }
  return null
}

function parseSections(text: string): Map<string, string[][]> {
  const sections = new Map<string, string[][]>()
  let current: string | null = null
  const lineBuffer: string[] = []

  function flushSection() {
    if (!current || lineBuffer.length === 0) return
    const body = lineBuffer.join("\n")
    const table = parseCsv(body)
    if (table.length > 0) sections.set(current, table)
    lineBuffer.length = 0
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      flushSection()
      current = sectionMatch[1]!.trim().toLowerCase()
      continue
    }
    if (!current) continue
    lineBuffer.push(line)
  }
  flushSection()
  return sections
}

export function exportTripCsv(raw: Group): string {
  const group = normalizeGroup(raw)
  const lines: string[] = [
    `# ${TRIP_CSV_FORMAT},${TRIP_CSV_VERSION}`,
    `# Trip: ${group.name} · Join code ${group.code}`,
    "",
    "[trip]",
    rowLine(["name", "code", "currency", "start_date", "end_date"]),
    rowLine([
      group.name,
      group.code,
      group.currency,
      group.startDate ?? "",
      group.endDate ?? "",
    ]),
    "",
    "[members]",
    rowLine(["name", "covered_by"]),
  ]
  for (const member of group.members) {
    const cover = member.coveredByMemberId
      ? memberNameById(group, member.coveredByMemberId)
      : ""
    lines.push(rowLine([member.name, cover]))
  }
  lines.push("", "[expenses]", rowLine(["date", "amount", "reason", "paid_by", "participants", "split", "voided"]))
  for (const expense of group.expenses) {
    const participants = expense.participantIds
      .map((id) => memberNameById(group, id))
      .join("; ")
    lines.push(
      rowLine([
        expense.date,
        String(expense.amount),
        expense.reason,
        memberNameById(group, expense.paidByMemberId),
        participants,
        expense.split,
        voidedLabel(expense.voidedAt),
      ])
    )
  }
  lines.push("", "[payments]", rowLine(["date", "amount", "from", "to", "voided"]))
  for (const payment of group.payments ?? []) {
    lines.push(
      rowLine([
        payment.date,
        String(payment.amount),
        memberNameById(group, payment.fromMemberId),
        memberNameById(group, payment.toMemberId),
        voidedLabel(payment.voidedAt),
      ])
    )
  }
  return `${lines.join("\n")}\n`
}

export type ParsedTripCsv = {
  trip: {
    name?: string
    currency?: string
    startDate?: string | null
    endDate?: string | null
  }
  members: Member[]
  expenses: Expense[]
  payments: Payment[]
}

function parseTripCsvV2(text: string): ParsedTripCsv {
  const sections = parseSections(text.replace(/^\uFEFF/, ""))
  const tripRows = tableToObjects(sections.get("trip") ?? [])
  const tripRow = tripRows[0]

  const members: Member[] = []
  const nameToId = new Map<string, string>()
  for (const row of tableToObjects(sections.get("members") ?? [])) {
    const name = row.name?.trim()
    if (!name) throw new Error("Member row missing name.")
    const key = name.toLowerCase()
    if (nameToId.has(key)) throw new Error(`Duplicate member name: ${name}`)
    const id = uid("m")
    nameToId.set(key, id)
    members.push({
      id,
      name,
      profileId: null,
      coveredByMemberId: null,
    })
  }
  if (members.length < 1) throw new Error("CSV must include at least one member.")

  for (const row of tableToObjects(sections.get("members") ?? [])) {
    const name = row.name!.trim()
    const member = members.find((m) => m.name === name)!
    const coverName = row.covered_by?.trim()
    if (coverName) {
      const coverId = nameToId.get(coverName.toLowerCase())
      if (!coverId) throw new Error(`Unknown covered_by member: ${coverName}`)
      if (coverId === member.id) throw new Error("A member cannot cover themselves in CSV.")
      member.coveredByMemberId = coverId
    }
  }

  function resolveMemberName(raw: string, label: string) {
    const name = raw.trim()
    const id = nameToId.get(name.toLowerCase())
    if (!id) throw new Error(`${label} references unknown member: ${name}`)
    return id
  }

  function parseParticipantNames(raw: string) {
    const names = raw
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length < 1) throw new Error("Expense needs at least one participant.")
    return names.map((n) => resolveMemberName(n, "Participant"))
  }

  const expenses: Expense[] = []
  for (const row of tableToObjects(sections.get("expenses") ?? [])) {
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Expense has invalid amount.")
    }
    const split: Expense["split"] = row.split === "percent" ? "percent" : "equal"
    const participantIds = parseParticipantNames(row.participants ?? "")
    expenses.push({
      id: uid("e"),
      date: row.date ?? "",
      amount: Math.round(amount * 100) / 100,
      reason: row.reason ?? "",
      paidByMemberId: resolveMemberName(row.paid_by ?? "", "Payer"),
      participantIds,
      split,
      shares: {},
      createdByProfileId: "",
      createdAt: new Date(0).toISOString(),
      voidedAt: parseVoided(row.voided),
      voidedByProfileId: null,
    })
  }

  const payments: Payment[] = []
  for (const row of tableToObjects(sections.get("payments") ?? [])) {
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payment has invalid amount.")
    }
    const fromMemberId = resolveMemberName(row.from ?? "", "Payment from")
    const toMemberId = resolveMemberName(row.to ?? "", "Payment to")
    if (fromMemberId === toMemberId) {
      throw new Error("Payment must be between two different members.")
    }
    payments.push({
      id: uid("pay"),
      date: row.date ?? "",
      amount: Math.round(amount * 100) / 100,
      fromMemberId,
      toMemberId,
      createdByProfileId: "",
      createdAt: new Date(0).toISOString(),
      voidedAt: parseVoided(row.voided),
      voidedByProfileId: null,
    })
  }

  const trip: ParsedTripCsv["trip"] = {}
  if (tripRow?.name) trip.name = tripRow.name
  if (tripRow?.currency) trip.currency = tripRow.currency.toUpperCase()
  if (tripRow && "start_date" in tripRow) {
    trip.startDate = tripRow.start_date?.trim() ? tripRow.start_date : null
  }
  if (tripRow && "end_date" in tripRow) {
    trip.endDate = tripRow.end_date?.trim() ? tripRow.end_date : null
  }

  return { trip, members, expenses, payments }
}

function rowsToObjectsV1(table: string[][]): CsvRow[] {
  if (table.length < 2) throw new Error("CSV has no data rows.")
  const header = table[0]!
  const index = new Map(header.map((name, i) => [name.trim(), i]))
  for (const col of V1_COLUMNS) {
    if (!index.has(col)) throw new Error(`CSV missing column: ${col}`)
  }
  return table.slice(1).map((cells) => {
    const row: CsvRow = {}
    for (const col of V1_COLUMNS) {
      const value = cells[index.get(col)!]?.trim()
      if (value) row[col] = value
    }
    return row
  })
}

function requireField(row: CsvRow, field: keyof CsvRow, label: string) {
  const value = row[field]?.trim()
  if (!value) throw new Error(`${label} is missing in CSV.`)
  return value
}

function parseShares(raw: string | undefined, participantIds: string[]) {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Invalid shares_json on an expense row.")
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid shares_json on an expense row.")
  }
  const shares: Record<string, number> = {}
  for (const id of participantIds) {
    const value = Number((parsed as Record<string, unknown>)[id])
    if (Number.isFinite(value)) shares[id] = value
  }
  return shares
}

function parseTripCsvV1(text: string): ParsedTripCsv {
  const table = parseCsv(text.replace(/^\uFEFF/, ""))
  const rows = rowsToObjectsV1(table)
  const meta = rows.find((row) => row.record === "meta")
  if (meta?.name !== TRIP_CSV_FORMAT || meta.code !== TRIP_CSV_VERSION_LEGACY) {
    throw new Error("Unrecognized trip CSV format or version.")
  }

  const tripRow = rows.find((row) => row.record === "trip")
  const members: Member[] = []
  const memberIds = new Set<string>()
  for (const row of rows.filter((item) => item.record === "member")) {
    const id = requireField(row, "id", "Member id")
    const name = requireField(row, "name", "Member name")
    if (memberIds.has(id)) throw new Error(`Duplicate member id ${id} in CSV.`)
    memberIds.add(id)
    members.push({
      id,
      name,
      profileId: row.profile_id || null,
      coveredByMemberId: row.covered_by_member_id || null,
    })
  }
  if (members.length < 1) throw new Error("CSV must include at least one member.")

  const memberSet = new Set(members.map((item) => item.id))
  function requireMember(id: string, label: string) {
    if (!memberSet.has(id)) {
      throw new Error(`${label} references unknown member id ${id}.`)
    }
  }

  for (const member of members) {
    if (member.coveredByMemberId) {
      requireMember(member.coveredByMemberId, "Cover")
      if (member.coveredByMemberId === member.id) {
        throw new Error("A member cannot cover themselves in CSV.")
      }
    }
  }

  const expenses: Expense[] = []
  for (const row of rows.filter((item) => item.record === "expense")) {
    const id = requireField(row, "id", "Expense id")
    const date = requireField(row, "date", "Expense date")
    const amount = Number(requireField(row, "amount", "Expense amount"))
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Expense ${id} has invalid amount.`)
    }
    const reason = requireField(row, "reason", "Expense reason")
    const paidByMemberId = requireField(row, "paid_by_member_id", "Expense payer")
    requireMember(paidByMemberId, "Payer")
    const participantIds = requireField(row, "participant_ids", "Expense participants")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean)
    if (participantIds.length < 1) {
      throw new Error(`Expense ${id} needs at least one participant.`)
    }
    for (const pid of participantIds) requireMember(pid, "Participant")
    const split: Expense["split"] = row.split === "percent" ? "percent" : "equal"
    const shares = split === "percent" ? parseShares(row.shares_json, participantIds) : {}
    expenses.push({
      id,
      date,
      amount: Math.round(amount * 100) / 100,
      reason,
      paidByMemberId,
      participantIds,
      split,
      shares,
      createdByProfileId: row.created_by_profile_id || "",
      createdAt: row.created_at || new Date(0).toISOString(),
      voidedAt: row.voided_at || null,
      voidedByProfileId: row.voided_by_profile_id || null,
    })
  }

  const payments: Payment[] = []
  for (const row of rows.filter((item) => item.record === "payment")) {
    const id = requireField(row, "id", "Payment id")
    const date = requireField(row, "date", "Payment date")
    const amount = Number(requireField(row, "amount", "Payment amount"))
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Payment ${id} has invalid amount.`)
    }
    const fromMemberId = requireField(row, "from_member_id", "Payment from")
    const toMemberId = requireField(row, "to_member_id", "Payment to")
    requireMember(fromMemberId, "Payment from")
    requireMember(toMemberId, "Payment to")
    if (fromMemberId === toMemberId) {
      throw new Error(`Payment ${id} must be between two different members.`)
    }
    payments.push({
      id,
      date,
      amount: Math.round(amount * 100) / 100,
      fromMemberId,
      toMemberId,
      createdByProfileId: row.created_by_profile_id || "",
      createdAt: row.created_at || new Date(0).toISOString(),
      voidedAt: row.voided_at || null,
      voidedByProfileId: row.voided_by_profile_id || null,
    })
  }

  const trip: ParsedTripCsv["trip"] = {}
  if (tripRow?.name) trip.name = tripRow.name
  if (tripRow?.currency) trip.currency = tripRow.currency.toUpperCase()
  if (tripRow && "start_date" in tripRow) {
    trip.startDate = tripRow.start_date?.trim() ? tripRow.start_date : null
  }
  if (tripRow && "end_date" in tripRow) {
    trip.endDate = tripRow.end_date?.trim() ? tripRow.end_date : null
  }

  return { trip, members, expenses, payments }
}

function isV2Csv(text: string) {
  const head = text.replace(/^\uFEFF/, "").slice(0, 800)
  if (/^\s*#\s*waybill-trip-csv\s*,\s*2/m.test(head)) return true
  if (/\[trip\]/i.test(head) && /\[members\]/i.test(head)) return true
  return false
}

function isV1Csv(text: string) {
  const table = parseCsv(text.replace(/^\uFEFF/, ""))
  if (table.length < 2) return false
  const header = table[0]!.map((h) => h.trim())
  return header.includes("record") && header.includes("paid_by_member_id")
}

export function parseTripCsv(text: string): ParsedTripCsv {
  const normalized = text.replace(/^\uFEFF/, "")
  if (isV2Csv(normalized)) return parseTripCsvV2(normalized)
  if (isV1Csv(normalized)) return parseTripCsvV1(normalized)
  throw new Error("Unrecognized trip CSV. Use a Waybill export or v2 section format.")
}

export function tripCsvFilename(group: Group) {
  const slug = group.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "trip"}-${group.code}.csv`
}

export function downloadTripCsvFile(group: Group) {
  if (typeof document === "undefined") return
  const csv = exportTripCsv(group)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = tripCsvFilename(group)
  anchor.click()
  URL.revokeObjectURL(url)
}
