import { readStore, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import {
  addExpense,
  addMember,
  addPayment,
  claimMember,
  deleteExpense,
  updateExpense,
  updateGroup,
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
      restore?: boolean
    }>(request)

    const result = await updateStore((store) => {
      if (body.action === "claim") {
        return claimMember(store, {
          groupId: id,
          memberId: body.memberId ?? "",
          profileId: body.profileId ?? "",
        })
      }
      if (body.action === "add-member") {
        return addMember(store, id, body.name ?? "")
      }
      if (body.action === "update-group") {
        return updateGroup(store, {
          groupId: id,
          profileId: body.profileId ?? "",
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
        })
      }
      if (body.action === "add-expense") {
        return addExpense(store, {
          groupId: id,
          date: body.date ?? "",
          amount: Number(body.amount),
          reason: body.reason ?? "",
          paidByMemberId: body.paidByMemberId ?? "",
          participantIds: body.participantIds ?? [],
          split: body.split,
          shares: body.shares,
          createdByProfileId: body.profileId ?? "",
        })
      }
      if (body.action === "delete-expense") {
        return deleteExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: body.profileId ?? "",
        })
      }
      if (body.action === "update-expense") {
        return updateExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: body.profileId ?? "",
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
        return voidExpense(store, {
          groupId: id,
          expenseId: body.expenseId ?? "",
          profileId: body.profileId ?? "",
          restore: body.restore,
        })
      }
      if (body.action === "add-payment") {
        return addPayment(store, {
          groupId: id,
          date: body.date ?? "",
          amount: Number(body.amount),
          fromMemberId: body.fromMemberId ?? "",
          toMemberId: body.toMemberId ?? "",
          createdByProfileId: body.profileId ?? "",
        })
      }
      if (body.action === "void-payment") {
        return voidPayment(store, {
          groupId: id,
          paymentId: body.paymentId ?? "",
          profileId: body.profileId ?? "",
          restore: body.restore,
        })
      }
      throw new Error("Unknown action.")
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
