import { readStore, storageMode, updateStore } from "@/lib/db"
import { fail, json, readBody } from "@/lib/http"
import { addExpense, addMember, claimMember, deleteExpense } from "@/lib/operations"

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
      profileId?: string
      memberId?: string
      date?: string
      amount?: number
      reason?: string
      paidByMemberId?: string
      participantIds?: string[]
      expenseId?: string
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
      if (body.action === "add-expense") {
        return addExpense(store, {
          groupId: id,
          date: body.date ?? "",
          amount: Number(body.amount),
          reason: body.reason ?? "",
          paidByMemberId: body.paidByMemberId ?? "",
          participantIds: body.participantIds ?? [],
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
      throw new Error("Unknown action.")
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
