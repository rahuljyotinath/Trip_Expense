import { readStore, storageMode, updateStore } from "@/lib/db"
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
    const store = await readStore()
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
      const result = await updateStore((store) =>
        removeContact(store, {
          ownerProfileId: sessionId,
          targetProfileId: body.targetProfileId ?? "",
        })
      )
      return json({
        contacts: contactListFromEnriched(result.contacts),
      })
    }
    const result = await updateStore((store) =>
      addContact(store, {
        ownerProfileId: sessionId,
        query: body.query,
        targetProfileId: body.targetProfileId,
      })
    )
    return json({ contacts: contactListFromEnriched(result.contacts) })
  } catch (error) {
    return fail(error)
  }
}
