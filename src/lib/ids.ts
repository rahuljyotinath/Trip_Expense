const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function randomInt(max: number) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

export function uid(prefix: string) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${prefix}_${hex}`
}

export function joinCode() {
  let code = ""
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[randomInt(CODE_CHARS.length)]
  }
  return code
}

export function nowIso() {
  return new Date().toISOString()
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}
