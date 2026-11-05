import { Effect } from "effect"
import { openUrl } from "@opencode/util/open"
import { load } from "./app-assets"
import { createDictationBridge } from "./dictation-bridge"

export type DictationOptions = { signal: AbortSignal; onReady: (url: string) => void }

export type DictationHost = {
  capture: (input: DictationOptions) => Promise<string | undefined>
  close: () => void
}

/** Reuse one local origin during the CLI session so the browser can reuse its cached speech model. */
export const make = Effect.fn("CliDictation.make")(function* () {
  const assets = yield* load()

  if (!assets.files["dictation.html"]) throw new Error("Voice typing is unavailable in this CLI build. Install the latest SubiCode release.")
  const bridge = createDictationBridge(assets.files)

  return {
    capture(input: DictationOptions) {
      if (input.signal.aborted) return Promise.resolve(undefined)
      const session = bridge.session(input.signal)
      input.onReady(session.url)
      void openUrl(session.url).catch(() => undefined)

      return session.result
    },
    close: bridge.close,
  }
})

export * as Dictation from "./dictation"
