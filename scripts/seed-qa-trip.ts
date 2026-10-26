/**
 * Seed a tagged QA trip on Postgres (production ledger).
 *
 *   POSTGRES_URL=... npx tsx scripts/seed-qa-trip.ts
 *
 * Optional: QA_CREATOR_PROFILE_ID (defaults to first profile in ledger)
 */
import { addExpense, addPayment, createGroup } from "../src/lib/operations"
import type { Group, Store } from "../src/lib/types"
import { mutateLedger, postgresUrl } from "./lib/ledger-postgres"

const QA_PREFIX = "[QA-TEMP]"
const MEMBER_NAMES = [
  "QA Alex",
  "QA Blake",
  "QA Casey",
  "QA Dana",
  "QA Ellis",
  "QA Finley",
  "QA Gray",
  "QA Harper",
  "QA Jordan",
  "QA Morgan",
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

function dateInRange(start: string, dayOffset: number) {
  const d = new Date(`${start}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

function seedTrip(store: Store): { store: Store; group: Group } {
  const creatorId =
    process.env.QA_CREATOR_PROFILE_ID?.trim() ||
    store.profiles[0]?.id ||
    ""
  if (!creatorId) {
    throw new Error("Ledger has no profiles. Set QA_CREATOR_PROFILE_ID.")
  }
  const creator = store.profiles.find((p) => p.id === creatorId)
  if (!creator) throw new Error(`Profile not found: ${creatorId}`)

  const suffix = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const startDate = "2026-03-01"
  const endDate = "2026-03-07"
  const names = [...MEMBER_NAMES]
  if (!names.some((n) => n.toLowerCase() === creator.name.toLowerCase())) {
    names[0] = creator.name
  } else {
    const idx = names.findIndex((n) => n.toLowerCase() === creator.name.toLowerCase())
    if (idx > 0) {
      ;[names[0], names[idx]] = [names[idx]!, names[0]!]
    }
  }

  let nextStore = store
  let group: Group
  ;({ store: nextStore, group } = createGroup(nextStore, {
    name: `${QA_PREFIX} Week sim ${suffix}`,
    currency: "INR",
    startDate,
    endDate,
    memberNames: names,
    createdByProfileId: creatorId,
  }))

  const rng = mulberry32(6108838)
  const reasons = [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Cab",
    "Fuel",
    "Snacks",
    "Museum tickets",
    "Hotel night",
    "Groceries",
    "Coffee",
  ]
  const memberIds = () => group.members.map((m) => m.id)

  for (let i = 0; i < 42; i += 1) {
    const day = Math.floor(rng() * 7)
    const date = dateInRange(startDate, day)
    const payer = pick(rng, group.members).id
    const all = memberIds()
    const participantCount = 2 + Math.floor(rng() * (all.length - 1))
    const shuffled = [...all].sort(() => rng() - 0.5)
    const participantIds = shuffled.slice(0, participantCount)
    const amount = Math.round((50 + rng() * 4950) * 100) / 100
    const split = rng() > 0.85 ? ("percent" as const) : ("equal" as const)
    const shares: Record<string, number> = {}
    if (split === "percent") {
      let left = 100
      for (let j = 0; j < participantIds.length; j += 1) {
        const id = participantIds[j]!
        if (j === participantIds.length - 1) shares[id] = left
        else {
          const part = Math.max(1, Math.floor(rng() * (left - (participantIds.length - j - 1))))
          shares[id] = part
          left -= part
        }
      }
    }
    ;({ store: nextStore, group } = addExpense(nextStore, {
      groupId: group.id,
      date,
      amount,
      reason: `${pick(rng, reasons)} #${i + 1}`,
      paidByMemberId: payer,
      participantIds,
      split,
      shares,
      createdByProfileId: creatorId,
    }))
  }

  if (group.members.length >= 2) {
    const [a, b] = group.members
    ;({ store: nextStore, group } = addPayment(nextStore, {
      groupId: group.id,
      date: "2026-03-07",
      amount: 500,
      fromMemberId: a!.id,
      toMemberId: b!.id,
      createdByProfileId: creatorId,
    }))
  }

  return { store: nextStore, group }
}

async function main() {
  if (!postgresUrl()) {
    console.error("Set POSTGRES_URL or DATABASE_URL.")
    process.exit(1)
  }

  const { group } = await mutateLedger((store) => seedTrip(store))
  console.log(
    JSON.stringify(
      {
        groupId: group.id,
        code: group.code,
        name: group.name,
        members: group.members.length,
        expenses: group.expenses.length,
        payments: (group.payments ?? []).length,
        tripUrl: `https://trip-expense-balancer-rahuljyotinath-8458s-projects.vercel.app/trip/${group.id}`,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
