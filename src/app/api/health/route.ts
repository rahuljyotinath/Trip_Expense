import {
  probeGithub,
  probePostgres,
  storageErrorMessage,
  storageMode,
} from "@/lib/db"
import { json } from "@/lib/http"

export async function GET() {
  const mode = storageMode()
  if (mode === "postgres") {
    const postgres = await probePostgres()
    const github = await probeGithub()
    return json({
      mode,
      connected: postgres.connected,
      warning: storageErrorMessage(github, postgres),
      repo: github.fullName,
      githubUrl: github.githubUrl,
      branch: github.branch,
      filePath: github.filePath,
      error: postgres.error,
      ledgerVersion: postgres.version ?? null,
    })
  }
  const probe = await probeGithub()
  return json({
    mode,
    connected: probe.connected,
    warning: storageErrorMessage(probe),
    repo: probe.fullName,
    githubUrl: probe.githubUrl,
    branch: probe.branch,
    filePath: probe.filePath,
    error: probe.error,
  })
}
