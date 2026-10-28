import { resolveSessionSecret } from "@/lib/auth-crypto"
import {
  probePostgres,
  readLedgerDataByteSize,
  storageErrorMessage,
  storageMode,
} from "@/lib/db"
import { json } from "@/lib/http"
import { connection } from "next/server"

function sessionReady() {
  try {
    resolveSessionSecret()
    return true
  } catch {
    return false
  }
}

export async function GET() {
  await connection()
  const mode = storageMode()
  const ready = sessionReady()
  if (mode === "postgres") {
    const [postgres, ledgerDataBytes] = await Promise.all([
      probePostgres(),
      readLedgerDataByteSize(),
    ])
    return json({
      mode,
      connected: postgres.connected,
      warning: storageErrorMessage(postgres),
      error: postgres.error,
      ledgerVersion: postgres.version ?? null,
      ledgerDataBytes,
      sessionReady: ready,
    })
  }
  return json({
    mode,
    connected: mode === "local",
    warning: storageErrorMessage(),
    error: null,
    sessionReady: ready,
  })
}
