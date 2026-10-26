import { normalizeGroup, type Expense, type Group, type Member, type Payment } from "@/lib/types"

export const TRIP_CSV_FORMAT = "waybill-trip-csv"
export const TRIP_CSV_VERSION = "1"

const COLUMNS = [
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

type CsvRow = Partial<Record<(typeof COLUMNS)[number], string>>

function escapeCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function rowLine(cells: Record<string, string | number | null | undefined>) {
  const line = COLUMNS.map((col) => {
    const raw = cells[col]
    if (raw === null || raw === undefined || raw === "") return ""
    return escapeCell(String(raw))
  })
  return line.join(",")
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

function rowsToObjects(table: string[][]): CsvRow[] {
  if (table.length < 2) throw new Error("CSV has no data rows.")
  const header = table[0]!
  const index = new Map(header.map((name, i) => [name.trim(), i]))
  for (const col of COLUMNS) {
    if (!index.has(col)) throw new Error(`CSV missing column: ${col}`)
  }
  return table.slice(1).map((cells) => {
    const row: CsvRow = {}
    for (const col of COLUMNS) {
      const value = cells[index.get(col)!]?.trim()
      if (value) row[col] = value
    }
    return row
  })
}

export function exportTripCsv(raw: Group): string {
  const group = normalizeGroup(raw)
  const lines: string[] = [COLUMNS.join(",")]
  lines.push(
    rowLine({
      record: "meta",
      name: TRIP_CSV_FORMAT,
      code: TRIP_CSV_VERSION,
    })
  )
  lines.push(
    rowLine({
      record: "trip",
      id: group.id,
      name: group.name,
      code: group.code,
      currency: group.currency,
      start_date: group.startDate ?? "",
      end_date: group.endDate ?? "",
      created_at: group.createdAt,
      created_by_profile_id: group.createdByProfileId,
    })
  )
  for (const member of group.members) {
    lines.push(
      rowLine({
        record: "member",
        id: member.id,
        name: member.name,
        profile_id: member.profileId ?? "",
        covered_by_member_id: member.coveredByMemberId ?? "",
      })
    )
  }
  for (const expense of group.expenses) {
    lines.push(
      rowLine({
        record: "expense",
        id: expense.id,
        date: expense.date,
        amount: expense.amount,
        reason: expense.reason,
        paid_by_member_id: expense.paidByMemberId,
        participant_ids: expense.participantIds.join("|"),
        split: expense.split,
        shares_json:
          expense.split === "percent" ? JSON.stringify(expense.shares) : "",
        created_by_profile_id: expense.createdByProfileId,
        created_at: expense.createdAt,
        voided_at: expense.voidedAt ?? "",
        voided_by_profile_id: expense.voidedByProfileId ?? "",
      })
    )
  }
  for (const payment of group.payments ?? []) {
    lines.push(
      rowLine({
        record: "payment",
        id: payment.id,
        date: payment.date,
        amount: payment.amount,
        from_member_id: payment.fromMemberId,
        to_member_id: payment.toMemberId,
        created_by_profile_id: payment.createdByProfileId,
        created_at: payment.createdAt,
        voided_at: payment.voidedAt ?? "",
        voided_by_profile_id: payment.voidedByProfileId ?? "",
      })
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

export function parseTripCsv(text: string): ParsedTripCsv {
  const table = parseCsv(text.replace(/^\uFEFF/, ""))
  const rows = rowsToObjects(table)
  const meta = rows.find((row) => row.record === "meta")
  if (meta?.name !== TRIP_CSV_FORMAT || meta.code !== TRIP_CSV_VERSION) {
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
