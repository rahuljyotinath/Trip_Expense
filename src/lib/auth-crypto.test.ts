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
  }
  env.NODE_ENV = "production"
  env.SESSION_SECRET = "test-session-secret"
  try {
    const token = createSessionToken("p_test")
    assert.equal(readSessionToken(token), "p_test")
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
  }
})

test("production requires SESSION_SECRET", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
  }
  env.NODE_ENV = "production"
  delete env.SESSION_SECRET
  try {
    assert.throws(() => createSessionToken("p_test"), /SESSION_SECRET/)
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
  }
})
