import { Option, Schema } from "effect"
import type { AssetMap } from "./app-assets"

const Request = Schema.fromJsonString(Schema.Struct({
  token: Schema.String,
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(16_000))),
}))

/** Loopback-only browser bridge. It receives reviewed text, never microphone audio. */
export function createDictationBridge(assets: AssetMap) {
  const sessions = new Map<string, { finish: (text?: string) => void; result: Promise<string | undefined> }>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    maxRequestBodySize: 65_536,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url)
      const headers = { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" }

      if (url.host !== server.url.host) return new Response(null, { status: 403, headers })

      if (url.pathname === "/result" || url.pathname === "/cancel") {
        if (request.method !== "POST") return new Response(null, { status: 405, headers })

        if (request.headers.get("Origin") !== server.url.origin) return new Response(null, { status: 403, headers })

        const payload = Schema.decodeUnknownOption(Request)(await request.text().catch(() => undefined))

        if (Option.isNone(payload)) return new Response(null, { status: 400, headers })
        const session = sessions.get(payload.value.token)

        if (!session) return new Response(null, { status: 410, headers })

        if (url.pathname === "/result" && !payload.value.text?.trim()) return new Response(null, { status: 400, headers })
        session.finish(url.pathname === "/result" ? payload.value.text?.trim() : undefined)

        return new Response(null, { status: 204, headers })
      }

      if (request.method !== "GET") return new Response(null, { status: 405, headers })

      if (url.pathname === "/events") {
        const session = sessions.get(url.searchParams.get("token") ?? "")

        if (!session) return new Response(null, { status: 410, headers })
        let active = true
        const encoder = new TextEncoder()
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("event: ready\ndata: ready\n\n"))
            void session.result.then((text) => {
              if (!active) return
              controller.enqueue(encoder.encode(`event: closed\ndata: ${text ? "used" : "cancelled"}\n\n`))
              controller.close()
            })
          },
          cancel() { active = false },
        })

        return new Response(body, { headers: { ...headers, "Content-Type": "text/event-stream" } })
      }

      if (url.pathname === "/status")
        return new Response(null, { status: sessions.has(url.searchParams.get("token") ?? "") ? 204 : 410, headers })

      const key = url.pathname === "/" ? "dictation.html" : url.pathname.slice(1)
      const body = assets[key]

      if (body === undefined) return new Response(null, { status: 404, headers })

      return new Response(typeof body === "string" ? body : new Uint8Array(body), {
        headers: { ...headers, "Content-Type": Bun.file(key).type },
      })
    },
  })

  return {
    session(signal: AbortSignal) {
      const token = crypto.randomUUID()
      const pending = Promise.withResolvers<string | undefined>()
      const finish = (text?: string) => {
        if (!sessions.delete(token)) return
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        pending.resolve(text)
      }
      const abort = () => finish()
      const timer = setTimeout(abort, 10 * 60_000)
      sessions.set(token, { finish, result: pending.promise })
      signal.addEventListener("abort", abort, { once: true })

      if (signal.aborted) finish()

      return { url: `${server.url.origin}/dictation.html#${token}`, result: pending.promise }
    },
    close() {
      sessions.forEach((session) => session.finish())
      void server.stop(true)
    },
  }
}
