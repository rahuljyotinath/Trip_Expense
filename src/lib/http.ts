export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export function fail(error: unknown, fallback = "Something broke.") {
  const message = error instanceof Error ? error.message : fallback
  const status = /not found/i.test(message) ? 404 : 400
  return json({ error: message }, status)
}

export async function readBody<T>(request: Request) {
  return (await request.json()) as T
}
