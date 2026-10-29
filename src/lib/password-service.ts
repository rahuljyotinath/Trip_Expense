import { randomBytes, createHash } from "node:crypto"
import { ApiError } from "./http"
import { getSql, readProfileForSession, updateStore, invalidateLoadCache } from "./db"
import { storageMode } from "./storage-mode"
import { isRelationalLedger } from "./ledger-backend"
import { hashPasswordAsync, verifyPasswordAsync } from "./auth-crypto"
import { validatePassword } from "./auth-validation"
import { consumeRecoveryCode, issueRecoveryCode, revokeProfileSessions } from "./security-store"
import { normalizeStore, type Profile, type Store } from "./types"

/** Password change/reset, session revocation and recovery rotation share one Postgres transaction. */
export async function replacePassword(profile: Profile, password: string, recoveryCode?: string) {
  validatePassword(password)
  const passwordHash = await hashPasswordAsync(password)
  if (storageMode() === "postgres") {
    const sql = getSql(); const relational = await isRelationalLedger(sql)
    const newCode = randomBytes(32).toString("base64url")
    const hash = (value: string) => createHash("sha256").update(value).digest("hex")
    await sql.begin(async (tx) => {
      if (recoveryCode !== undefined) {
        const codes = await tx`DELETE FROM auth_recovery_codes WHERE profile_id = ${profile.id} AND code_hash = ${hash(recoveryCode)} RETURNING profile_id`
        if (codes.length !== 1) throw new ApiError("Recovery code or username is incorrect.", 401, "INVALID_CREDENTIALS")
      }
      if (relational) {
        const updated = await tx`UPDATE profiles SET password_hash = ${passwordHash} WHERE id = ${profile.id} AND password_hash = ${profile.passwordHash} RETURNING id`
        if (updated.length !== 1) throw new ApiError("Sign in again before changing your password.", 409, "CONFLICT")
      } else {
        const rows = await tx<{ data: Store }[]>`SELECT data FROM ledger_store WHERE id = 'main' FOR UPDATE`
        const store = normalizeStore(rows[0]?.data)
        const current = store.profiles.find((item) => item.id === profile.id && item.passwordHash === profile.passwordHash)
        if (!current) throw new ApiError("Sign in again before changing your password.", 409, "CONFLICT")
        current.passwordHash = passwordHash
        await tx`UPDATE ledger_store SET data = ${tx.json(JSON.parse(JSON.stringify(store)))}, version = version + 1, updated_at = now() WHERE id = 'main'`
      }
      await tx`DELETE FROM auth_sessions WHERE profile_id = ${profile.id}`
      await tx`INSERT INTO auth_recovery_codes(profile_id, code_hash) VALUES (${profile.id}, ${hash(newCode)}) ON CONFLICT(profile_id) DO UPDATE SET code_hash = EXCLUDED.code_hash`
    })
    invalidateLoadCache()
    return newCode
  }
  if (recoveryCode !== undefined && !await consumeRecoveryCode(profile.id, recoveryCode)) throw new ApiError("Recovery code or username is incorrect.", 401, "INVALID_CREDENTIALS")
  await updateStore((store) => {
    const current = store.profiles.find((item) => item.id === profile.id && item.passwordHash === profile.passwordHash)
    if (!current) throw new ApiError("Sign in again before changing your password.", 409, "CONFLICT")
    return { store: { ...store, profiles: store.profiles.map((item) => item.id === profile.id ? { ...item, passwordHash } : item) } }
  }, { scope: { kind: "createTrip" } })
  await revokeProfileSessions(profile.id)
  return issueRecoveryCode(profile.id)
}

export async function authenticateCurrentPassword(profileId: string, password: string) {
  const profile = await readProfileForSession(profileId)
  if (!profile || !await verifyPasswordAsync(password, profile.passwordHash)) throw new ApiError("Current password is incorrect.", 401, "INVALID_CREDENTIALS")
  return profile
}
