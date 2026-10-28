import { profileFromId } from "@/lib/auth-ops"
import {
  invalidateLoadCache,
  probePostgres,
  readGroupById,
  readStoreFresh,
  storageMode,
  updateStore,
} from "@/lib/db"
import { connection } from "next/server"
import { fail, json, readBody } from "@/lib/http"
import { sessionProfileId } from "@/lib/session"
import {
  isTripAdmin,
  joinRequestsForGroup,
  joinRequestForProfile,
  storeTripInvites,
} from "@/lib/trip-invites"
import { linkedProfilesForGroup } from "@/lib/linked-trip-profiles"
import { canViewGroup } from "@/lib/trip-access"
import {
  addExpense,
  addMember,
  addPayment,
  approveJoinRequest,
  claimMemberWithJoinApproval,
  declineTripInvite,
  deleteExpense,
  updateExpense,
  updateGroup,
  importTripCsv,
  rejectJoinRequest,
  requestJoin,
  revokeTripInvite,
  sendTripInvite,
  setMemberCover,
  setTripAdmin,
  reorderLedgerDay,
  voidExpense,
  voidPayment,
} from "@/lib/operations"
import type { SplitMode } from "@/lib/types"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  const { id } = await params
  const joinCode = new URL(request.url).searchParams.get("join")
  try {
    await connection()
    invalidateLoadCache()
    let group = await readGroupById(id)
    if (!group) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      invalidateLoadCache()
      if (storageMode() === "postgres") {
        group = await readGroupById(id)
      } else {
        const store = await readStoreFresh()
        group = store.groups.find((item) => item.id === id) ?? null
      }
    }
    if (!group) {
      const mode = storageMode()
      const postgres =
        mode === "postgres" ? await probePostgres() : { version: undefined }
      console.warn(
        `[groups GET] trip not found id=${id} mode=${mode} ledgerVersion=${postgres.version ?? "n/a"}`
      )
      return json({ error: "Trip not found." }, 404)
    }
    const store = await readStoreFresh()
    const joinRequests = store.joinRequests ?? []
    if (!canViewGroup(sessionId, group, { joinCode, joinRequests })) {
      return json({ error: "You don't have access to this trip." }, 403)
    }
    const joinRequest = joinRequestForProfile(store, group.id, sessionId)
    const admin = isTripAdmin(group, sessionId)
    const pendingJoinRequests = admin
      ? joinRequestsForGroup(store, group.id)
          .filter((item) => item.status === "pending")
          .map((item) => ({
            ...item,
            profileName:
              store.profiles.find((profile) => profile.id === item.profileId)?.name ??
              "Traveler",
            profileUsername:
              store.profiles.find((profile) => profile.id === item.profileId)
                ?.username ?? null,
          }))
      : undefined
    const pendingTripInvites = admin
      ? storeTripInvites(store).filter(
          (item) => item.groupId === group.id && item.status === "pending"
        )
      : undefined
    return json({
      group,
      joinRequest,
      pendingJoinRequests,
      pendingTripInvites,
      linkedProfiles: linkedProfilesForGroup(store, group),
    })
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
      clientOpId?: string
      fromMemberId?: string
      toMemberId?: string
      coveredByMemberId?: string | null
      csv?: string
      restore?: boolean
      orderedIds?: string[]
      inviteId?: string
      requestId?: string
      email?: string | null
      phone?: string | null
      code?: string
      targetProfileId?: string | null
      isAdmin?: boolean
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
        return claimMemberWithJoinApproval(store, {
          groupId: id,
          memberId: body.memberId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "request-join") {
        requireSessionProfile()
        return requestJoin(store, {
          groupId: id,
          profileId: sessionId,
          code: body.code ?? "",
        })
      }
      if (body.action === "approve-join-request") {
        requireSessionProfile()
        return approveJoinRequest(store, {
          groupId: id,
          requestId: body.requestId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "reject-join-request") {
        requireSessionProfile()
        return rejectJoinRequest(store, {
          groupId: id,
          requestId: body.requestId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "send-trip-invite") {
        requireSessionProfile()
        return sendTripInvite(store, {
          groupId: id,
          profileId: sessionId,
          email: body.email,
          phone: body.phone,
          targetProfileId: body.targetProfileId,
        })
      }
      if (body.action === "revoke-trip-invite") {
        requireSessionProfile()
        return revokeTripInvite(store, {
          groupId: id,
          inviteId: body.inviteId ?? "",
          profileId: sessionId,
        })
      }
      if (body.action === "add-member") {
        requireSessionProfile()
        return addMember(store, id, body.name ?? "", sessionId)
      }
      if (body.action === "set-trip-admin") {
        requireSessionProfile()
        return setTripAdmin(store, {
          groupId: id,
          actorProfileId: sessionId,
          targetProfileId: body.targetProfileId ?? "",
          isAdmin: Boolean(body.isAdmin),
        })
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
          expenseId: body.expenseId,
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
          paymentId: body.paymentId,
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
      if (body.action === "reorder-ledger-day") {
        requireSessionProfile()
        return reorderLedgerDay(store, {
          groupId: id,
          profileId: sessionId,
          date: body.date ?? "",
          orderedIds: body.orderedIds ?? [],
        })
      }
      throw new Error("Unknown action.")
    })
    return json({ group: result.group })
  } catch (error) {
    return fail(error)
  }
}
