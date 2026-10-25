export function evenPercents(ids: string[]) {
  const shares: Record<string, number> = {}
  if (ids.length === 0) return shares
  const base = Math.floor(10000 / ids.length) / 100
  let used = 0
  for (let i = 0; i < ids.length - 1; i += 1) {
    shares[ids[i]] = base
    used += base
  }
  shares[ids[ids.length - 1]] = Math.round((100 - used) * 100) / 100
  return shares
}

export function shareTotal(ids: string[], shares: Record<string, number>) {
  return Math.round(
    ids.reduce((sum, id) => sum + (Number(shares[id]) || 0), 0) * 100
  )
}

export function sharesComplete(ids: string[], shares: Record<string, number>) {
  if (ids.length === 0) return false
  if (ids.some((id) => !Number.isFinite(shares[id]) || shares[id] <= 0)) return false
  return shareTotal(ids, shares) === 10000
}

export function allocatePercent(
  totalPaise: number,
  ids: string[],
  shares: Record<string, number>
) {
  const weights = ids.map((id) => Math.max(0, Math.round((shares[id] ?? 0) * 100)))
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const cuts = new Map<string, number>()
  if (weightSum <= 0 || ids.length === 0) {
    for (const id of ids) cuts.set(id, 0)
    return cuts
  }

  let used = 0
  const remainders: { id: string; leftover: number }[] = []
  for (let i = 0; i < ids.length; i += 1) {
    const raw = (totalPaise * weights[i]) / weightSum
    const cut = Math.floor(raw)
    cuts.set(ids[i], cut)
    used += cut
    remainders.push({ id: ids[i], leftover: raw - cut })
  }

  remainders.sort((a, b) => b.leftover - a.leftover)
  let leftover = totalPaise - used
  for (const item of remainders) {
    if (leftover <= 0) break
    cuts.set(item.id, (cuts.get(item.id) ?? 0) + 1)
    leftover -= 1
  }
  return cuts
}
