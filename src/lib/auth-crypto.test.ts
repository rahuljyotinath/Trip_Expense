import assert from "node:assert/strict"
import test from "node:test"
import { createSessionToken, readSessionToken, resolveSessionSecret } from "./auth-crypto"

const env = process.env as Record<string, string | undefined>

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete env[name]
  else env[name] = value
}

test("session token uses SESSION_SECRET when set", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    VERCEL: process.env.VERCEL,
    POSTGRES_URL: process.env.POSTGRES_URL,
  }
  env.NODE_ENV = "production"
  env.SESSION_SECRET = "test-session-secret-at-least-32-bytes-long"
  delete env.VERCEL
  delete env.POSTGRES_URL
  try {
    const token = createSessionToken("p_test")
    assert.equal(readSessionToken(token), "p_test")
    assert.equal(resolveSessionSecret(), "test-session-secret-at-least-32-bytes-long")
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
    restore("VERCEL", saved.VERCEL)
    restore("POSTGRES_URL", saved.POSTGRES_URL)
  }
})

test("production on Vercel requires an independent session secret", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    VERCEL: process.env.VERCEL,
    POSTGRES_URL: process.env.POSTGRES_URL,
  }
  env.NODE_ENV = "production"
  delete env.SESSION_SECRET
  env.VERCEL = "1"
  env.POSTGRES_URL = "postgres://example/db"
  try {
    assert.throws(() => createSessionToken("p_vercel"), /SESSION_SECRET/)
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
    restore("VERCEL", saved.VERCEL)
    restore("POSTGRES_URL", saved.POSTGRES_URL)
  }
})

test("production requires SESSION_SECRET when not on Vercel and no postgres", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    VERCEL: process.env.VERCEL,
    POSTGRES_URL: process.env.POSTGRES_URL,
  }
  env.NODE_ENV = "production"
  delete env.SESSION_SECRET
  delete env.VERCEL
  delete env.POSTGRES_URL
  try {
    assert.throws(() => createSessionToken("p_test"), /SESSION_SECRET/)
  } finally {
    restore("NODE_ENV", saved.NODE_ENV)
    restore("SESSION_SECRET", saved.SESSION_SECRET)
    restore("VERCEL", saved.VERCEL)
    restore("POSTGRES_URL", saved.POSTGRES_URL)
  }
})
