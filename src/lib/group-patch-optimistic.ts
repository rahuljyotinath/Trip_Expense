import { commitGroupPatch, fetchGroup } from "@/lib/client-api"
import type { Group, PublicProfile } from "@/lib/types"

export function applyGroupPatchOptimistic(input: {
  group: Group
  profile: PublicProfile
  body: Record<string, unknown>
  onGroup: (next: Group) => void
  onError: (message: string | null) => void
  onBusy: (busy: boolean) => void
  onDone?: () => void
  refresh?: () => Promise<void>
}) {
  const { group, profile, body, onGroup, onError, onBusy, onDone } = input
  onBusy(true)
  onError(null)
  commitGroupPatch(
    group,
    body,
    {
      onApplied: (next) => {
        onGroup(next)
        onBusy(false)
        onDone?.()
      },
      onError: (message) => {
        onError(message)
        onBusy(false)
      },
      onReconciled: (next) => {
        onGroup(next)
        onError(null)
      },
      fetchLatest: () => fetchGroup(group.id),
    },
    profile
  )
}
