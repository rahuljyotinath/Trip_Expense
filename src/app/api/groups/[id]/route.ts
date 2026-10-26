import { profileFromId } from "@/lib/auth-ops"
import { invalidateLoadCache, readStore, storageMode, updateStore } from "@/lib/db"
import { connection } from "next/server"
import { fail, json, readBody } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import {
  addExpense,
  addMember,
  addPayment,
  claimMember,
  deleteExpense,
  updateExpense,
  updateGroup,
  importTripCsv,
  setMemberCover,
  voidExpense,
  voidPayment,
} from "@/lib/operations"
import type { SplitMode } from "@/lib/types"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const { id } = await params
  try {
    await connection()
    invalidateLoadCache()
    const store = await readStore()
    const group = store.groups.find((item) => item.id === id)
    if (!group) return json({ error: "Trip not found." }, 404)
    return json({ group })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const { id } = await params
  try {
    const sessionId = await sessionProfileId()
    if (!sessionId) {
      return json({ error: "Sign in again." }, 401)
    }

    const body = await readBody<{
      action?: string
      name?: string
      startDate?: string | null
      endDate?: string | null
      profileId?: string
      memberId?: string
      date?: string
      amount?: number
      reason?: string
      paidByMemberId?: string
      participantIds?: string[]
      split?: SplitMode
      shares?: Record<string, number>
      expenseId?: string
      paymentId?: string
      fromMemberId?: string
      toMemberId?: string
      coveredByMemberId?: string | null
      csv?: string
      restore?: boolean
    }>(request)

    const result = await updateStore((store) => {
      const requireSessionProfile = () => {
        const profile = profileFromId(store, sessionId)
        if (!profile) {
          throw new Error("Sign in again — your account is not on the ledger.")
        }
        return profile
      }

      if (body.action === "claim") {
        requireSessionProfile()
        return claimMember(store, {
          groupId: id,
          memberId: body.memberId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "add-member") {
        return addMember(store, id, body.name ?? "")
      }
      if (body.action === "update-group") {
        requireSessionProfile()
        return updateGroup(store, {
          groupId: id,
          profileId: sessionId,
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
        })
      }
      if (body.action === "add-expense") {
        requireSessionProfile()
        return addExpense(store, {
          groupId: id,
          date: body.date ?? "",
          amount: Number(body.amount),
          reason: body.reason ?? "",
          paidByMemberId: body.paidByMemberId ?? "",
          participantIds: body.participantIds ?? [],
          split: body.split,
          shares: body.shares,
          createdByProfileId: sessionId,
        })
      }
      if (body.action === "delete-expense") {
        requireSessionProfile()
        return deleteExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "update-expense") {
        requireSessionProfile()
        return updateExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: sessionId,
          date: body.date ?? "",
          amount: Number(body.amount),
          reason: body.reason ?? "",
          paidByMemberId: body.paidByMemberId ?? "",
          participantIds: body.participantIds ?? [],
          split: body.split,
          shares: body.shares,
        })
      }
      if (body.action === "void-expense") {
        requireSessionProfile()
        return voidExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: sessionId,
          restore: body.restore,
        })
      }
      if (body.action === "add-payment") {
        requireSessionProfile()
        return addPayment(store, {
          groupId: id,
          date: body.date ?? "",
          amount: Number(body.amount),
          fromMemberId: body.fromMemberId ?? "",
          toMemberId: body.toMemberId ?? "",
          createdByProfileId: sessionId,
        })
      }
      if (body.action === "void-payment") {
        requireSessionProfile()
        return voidPayment(store, {
          groupId: id,
          paymentId: body.paymentId ?? "",
          profileId: sessionId,
          restore: body.restore,
        })
      }
      if (body.action === "import-trip-csv") {
        requireSessionProfile()
        return importTripCsv(store, {
          groupId: id,
          profileId: sessionId,
          csv: body.csv ?? "",
        })
      }
      if (body.action === "cover-member") {
        requireSessionProfile()
        const rawCover = body.coveredByMemberId
        return setMemberCover(store, {
          groupId: id,
          memberId: body.memberId ?? "",
          coveredByMemberId:
            rawCover === null || rawCover === undefined || rawCover === ""
              ? null
              : String(rawCover),
          profileId: sessionId,
        })
      }
      throw new Error("Unknown action.")
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
