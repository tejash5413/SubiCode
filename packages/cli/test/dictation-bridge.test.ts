import { expect, test } from "bun:test"
import { createDictationBridge } from "../src/dictation-bridge"

test("delivers reviewed text once and serves only the embedded browser files", async () => {
  const bridge = createDictationBridge({ "dictation.html": "<h1>Voice typing</h1>", "_assets/voice.js": "export {}" })
  const controller = new AbortController()

  try {
    const session = bridge.session(controller.signal)
    const url = new URL(session.url)
    const token = url.hash.slice(1)
    const response = await fetch(`${url.origin}/result`, { method: "POST",
      headers: { Origin: url.origin }, body: JSON.stringify({ token, text: "  Edited voice draft  " }) })
    expect(response.status).toBe(204)
    expect(await session.result).toBe("Edited voice draft")
    expect((await fetch(`${url.origin}/result`, { method: "POST", headers: { Origin: url.origin },
      body: JSON.stringify({ token, text: "Duplicate" }) })).status).toBe(410)
    expect(await (await fetch(`${url.origin}/dictation.html`)).text()).toBe("<h1>Voice typing</h1>")
    expect((await fetch(`${url.origin}/not-an-asset`)).status).toBe(404)
  } finally {
    bridge.close()
  }
})

test.each([
  ["cross-origin", "https://example.com", "valid", "hello", 403],
  ["missing origin", "", "valid", "hello", 403],
  ["wrong token", "local", "wrong", "hello", 410],
  ["empty transcript", "local", "valid", "  ", 400],
  ["oversized transcript", "local", "valid", "x".repeat(16_001), 400],
] as const)("rejects %s without completing the pending draft", async (_, origin, credential, text, status) => {
  const bridge = createDictationBridge({ "dictation.html": "voice" })
  const controller = new AbortController()

  try {
    const session = bridge.session(controller.signal)
    const url = new URL(session.url)
    const response = await fetch(`${url.origin}/result`, { method: "POST", headers: {
      ...(origin ? { Origin: origin === "local" ? url.origin : origin } : {}),
    }, body: JSON.stringify({ token: credential === "valid" ? url.hash.slice(1) : "wrong", text }) })
    expect(response.status).toBe(status)
    expect((await fetch(`${url.origin}/status?token=${url.hash.slice(1)}`)).status).toBe(204)
    controller.abort()
    expect(await session.result).toBeUndefined()
  } finally {
    bridge.close()
  }
})

test("cancelling an old recording cannot fill another pending draft", async () => {
  const bridge = createDictationBridge({ "dictation.html": "voice" })
  const oldController = new AbortController()
  const nextController = new AbortController()

  try {
    const old = bridge.session(oldController.signal)
    const next = bridge.session(nextController.signal)
    oldController.abort()
    expect(await old.result).toBeUndefined()
    const url = new URL(next.url)
    expect((await fetch(`${url.origin}/status?token=${new URL(old.url).hash.slice(1)}`)).status).toBe(410)
    expect((await fetch(`${url.origin}/cancel`, { method: "POST", headers: { Origin: url.origin },
      body: JSON.stringify({ token: url.hash.slice(1) }) })).status).toBe(204)
    expect(await next.result).toBeUndefined()
  } finally {
    bridge.close()
  }
})

test("terminal cancellation immediately closes the browser recording session", async () => {
  const bridge = createDictationBridge({ "dictation.html": "voice" })
  const controller = new AbortController()

  try {
    const session = bridge.session(controller.signal)
    const url = new URL(session.url)
    const response = await fetch(`${url.origin}/events?token=${url.hash.slice(1)}`)
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    const reader = response.body?.getReader()

    if (!reader) throw new Error("Session events are unavailable")
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: ready")
    controller.abort()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("data: cancelled")
    expect((await reader.read()).done).toBe(true)
    expect(await session.result).toBeUndefined()
  } finally {
    bridge.close()
  }
})
