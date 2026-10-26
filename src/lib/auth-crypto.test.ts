import assert from "node:assert/strict"
import test from "node:test"
import { createSessionToken, readSessionToken } from "./auth-crypto"

const env = process.env as Record<string, string | undefined>

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete env[name]
  else env[name] = value
}

test("session token uses SESSION_SECRET when set", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  }
  env.NODE_ENV = "production"
  env.SESSION_SECRET = "test-session-secret"
  delete env.GITHUB_TOKEN
  try {
    const token = createSessionToken("p_test")
    assert.equal(readSessionToken(token), "p_test")
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
    restore("GITHUB_TOKEN", saved.GITHUB_TOKEN)
  }
})

test("session token derives from GITHUB_TOKEN in production when SESSION_SECRET unset", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  }
  env.NODE_ENV = "production"
  delete env.SESSION_SECRET
  env.GITHUB_TOKEN = "pat-test-token"
  try {
    const token = createSessionToken("p_github")
    assert.equal(readSessionToken(token), "p_github")
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
    restore("GITHUB_TOKEN", saved.GITHUB_TOKEN)
  }
})
