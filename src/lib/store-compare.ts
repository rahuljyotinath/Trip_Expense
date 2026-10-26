import type { Store } from "./types"

export function storeSnapshot(store: Store) {
  return JSON.stringify(store)
}

export function storesEqual(a: Store, b: Store) {
  return storeSnapshot(a) === storeSnapshot(b)
}
