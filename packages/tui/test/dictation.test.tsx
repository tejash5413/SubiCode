import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createAppFixture } from "./fixture/app"

test("voice typing fills an editable prompt and does not submit it", async () => {
  const reviewed = Promise.withResolvers<string | undefined>()
  const opened = Promise.withResolvers<void>()
  const submissions: string[] = []
  await using setup = await createAppFixture({
    config: { keybinds: { "prompt.clear": "f9" } },
    app: { dictate: async ({ onReady }) => {
      onReady("http://voice.invalid/dictation.html#fixture")
      opened.resolve()

      return reviewed.promise
    } },
    fetch: (url, request) => {
      if (request.method === "POST" && /\/(prompt|message|command)$/.test(url.pathname)) submissions.push(url.pathname)
    },
  })
  await setup.ready
  await setup.waitForFrame((frame) => frame.includes("commands"))
  setup.mockInput.pressKey("F9")
  await setup.waitFor(() => setup.renderer.currentFocusedRenderable instanceof TextareaRenderable &&
    setup.renderer.currentFocusedRenderable.plainText === "")
  setup.mockInput.typeText("/voice")
  await setup.waitForFrame((frame) => frame.includes("Voice typing"))
  setup.mockInput.pressEnter()
  await setup.waitForFrame((frame) => frame.includes("review the text"))
  await opened.promise
  reviewed.resolve("Create a settings page")
  await setup.waitForFrame((frame) => frame.includes("Create a settings page"))
  const input = setup.renderer.currentFocusedRenderable
  expect(input).toBeInstanceOf(TextareaRenderable)

  if (!(input instanceof TextareaRenderable)) throw new Error("Prompt did not regain focus")
  expect(input.plainText).toContain("Create a settings page")
  setup.mockInput.typeText("please")
  await setup.waitForFrame((frame) => frame.includes("please"))
  expect(submissions).toEqual([])
})

test("closing voice typing discards a late transcription", async () => {
  const reviewed = Promise.withResolvers<string | undefined>()
  const opened = Promise.withResolvers<AbortSignal>()
  await using setup = await createAppFixture({ config: { keybinds: { "prompt.clear": "f9" } }, app: { dictate: async ({ signal, onReady }) => {
    onReady("http://voice.invalid/dictation.html#fixture")
    opened.resolve(signal)

    return reviewed.promise
  } } })
  await setup.ready
  await setup.waitForFrame((frame) => frame.includes("commands"))
  setup.mockInput.pressKey("F9")
  await setup.waitFor(() => setup.renderer.currentFocusedRenderable instanceof TextareaRenderable &&
    setup.renderer.currentFocusedRenderable.plainText === "")
  setup.mockInput.typeText("/voice")
  await setup.waitForFrame((frame) => frame.includes("Voice typing"))
  setup.mockInput.pressEnter()
  await setup.waitForFrame((frame) => frame.includes("review the text"))
  const signal = await opened.promise
  setup.mockInput.pressEscape()
  await setup.waitForFrame((frame) => !frame.includes("review the text") && frame.includes("commands"))
  expect(signal.aborted).toBe(true)
  reviewed.resolve("This must not be inserted")
  await reviewed.promise
  await setup.renderOnce()
  const input = setup.renderer.currentFocusedRenderable

  if (!(input instanceof TextareaRenderable)) throw new Error("Prompt did not regain focus")
  expect(input.plainText).toBe("")
})
