import { resolveSessionSecret } from "@/lib/auth-crypto"
import {
  probePostgres,
  readLedgerHealthStats,
  storageErrorMessage,
  storageMode,
} from "@/lib/db"
import { getAppDisplayName } from "@/lib/app-display-name"
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

export async function GET(request: Request) {
  await connection()
  const mode = storageMode()
  const ready = sessionReady()
  if (mode === "postgres") {
    const [postgres, stats] = await Promise.all([
      probePostgres(),
      new URL(request.url).searchParams.get("stats") === "1"
        ? readLedgerHealthStats()
        : Promise.resolve(null),
    ])
    return json({
      app: getAppDisplayName(),
      mode,
      connected: postgres.connected,
      warning: storageErrorMessage(postgres),
      error: postgres.error,
      ledgerVersion: postgres.version ?? null,
      ledgerDataBytes: stats?.ledgerDataBytes ?? null,
      profileCount: stats?.profileCount ?? null,
      tripCount: stats?.tripCount ?? null,
      expenseCount: stats?.expenseCount ?? null,
      paymentCount: stats?.paymentCount ?? null,
      sessionReady: ready,
    })
  }
  return json({
    app: getAppDisplayName(),
    mode,
    connected: mode === "local",
    warning: storageErrorMessage(),
    error: null,
    sessionReady: ready,
  })
}
