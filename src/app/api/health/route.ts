import {
  probeGithubRepoOnly,
  probePostgres,
  storageErrorMessage,
  storageMode,
} from "@/lib/db"
import { githubUrl, resolveGithubTarget } from "@/lib/github-target"
import { json } from "@/lib/http"
import { connection } from "next/server"

export async function GET() {
  await connection()
  const mode = storageMode()
  const target = resolveGithubTarget()
  if (mode === "postgres") {
    const postgres = await probePostgres()
    return json({
      mode,
      connected: postgres.connected,
      warning: storageErrorMessage(undefined, postgres),
      repo: target.fullName,
      githubUrl: githubUrl(target),
      branch: target.branch,
      filePath: target.filePath,
      error: postgres.error,
      ledgerVersion: postgres.version ?? null,
    })
  }
  const probe = await probeGithubRepoOnly()
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
