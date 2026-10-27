import type { EnrichedContact } from "@/lib/trip-contacts"
import type { ContactSource, PublicProfileView } from "@/lib/types"

export type ContactListItem = PublicProfileView & {
  contactId: string
  source: ContactSource
  createdAt: string
}

export function contactListFromEnriched(rows: EnrichedContact[]): ContactListItem[] {
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    createdAt: row.createdAt,
    contactId: row.contactId,
    source: row.source,
  }))
}
