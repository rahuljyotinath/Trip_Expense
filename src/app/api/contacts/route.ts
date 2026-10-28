import {
  readProfileForSession,
  readProfileForContactSearch,
  readStoreForContacts,
  storageMode,
  updateStore,
} from "@/lib/db"
import { normalizeStore } from "@/lib/types"
import { fail, json, readBody } from "@/lib/http"
import { addContact, removeContact } from "@/lib/operations"
import { contactListFromEnriched } from "@/lib/contact-list"
import { listContactsForProfile } from "@/lib/trip-contacts"
import { sessionProfileId } from "@/lib/session"
import { connection } from "next/server"

export async function GET() {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  try {
    await connection()
    const store = await readStoreForContacts(sessionId)
    const contacts = contactListFromEnriched(
      listContactsForProfile(store, sessionId)
    )
    return json({ contacts })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  if (storageMode() === "unconfigured") {
    return json({ error: "unconfigured" }, 503)
  }
  const sessionId = await sessionProfileId()
  if (!sessionId) {
    return json({ error: "Sign in again." }, 401)
  }
  try {
    const body = await readBody<{
      action?: string
      query?: string
      targetProfileId?: string
    }>(request)
    if (body.action === "remove") {
      const result = await updateStore(
        (store) =>
          removeContact(store, {
            ownerProfileId: sessionId,
            targetProfileId: body.targetProfileId ?? "",
          }),
        { scope: { kind: "createTrip" } }
      )
      return json({
        contacts: contactListFromEnriched(result.contacts),
      })
    }
    let targetProfileId = body.targetProfileId?.trim()
    if (!targetProfileId && body.query?.trim()) {
      const found = await readProfileForContactSearch(body.query)
      if (!found) throw new Error("No profile matches that username, email, or phone.")
      targetProfileId = found.id
    }
    const owner = await readProfileForSession(sessionId)
    if (!owner) throw new Error("Sign in again.")
    const target =
      targetProfileId && targetProfileId !== owner.id
        ? (await readProfileForSession(targetProfileId)) ??
          (body.query?.trim()
            ? await readProfileForContactSearch(body.query)
            : null)
        : null
    const result = await updateStore(
      (store) => {
        const seeded = normalizeStore({
          ...store,
          profiles: [
            ...store.profiles,
            ...(owner && !store.profiles.some((p) => p.id === owner.id) ? [owner] : []),
            ...(target && !store.profiles.some((p) => p.id === target.id)
              ? [target]
              : []),
          ],
        })
        return addContact(seeded, {
          ownerProfileId: sessionId,
          targetProfileId,
          query: body.query,
        })
      },
      { scope: { kind: "createTrip" } }
    )
    return json({ contacts: contactListFromEnriched(result.contacts) })
  } catch (error) {
    return fail(error)
  }
}
