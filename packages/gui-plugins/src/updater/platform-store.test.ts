import { expect, mock, test } from "bun:test"
import { Effect } from "effect"

mock.module("electron", () => ({ app: {}, autoUpdater: {} }))

mock.module("electron-updater", () => ({ default: { autoUpdater: {} } }))

test("Store packages leave servicing to Windows before reading any GitHub updater credentials", async () => {
  const original = Object.getOwnPropertyDescriptor(process, "windowsStore")
  Object.defineProperty(process, "windowsStore", { value: true, configurable: true })

  try {
    const platform = await import("./platform")
    expect(await Effect.runPromise(platform.make("prod"))).toBeUndefined()
  } finally {
    if (original) Object.defineProperty(process, "windowsStore", original)

    if (!original) {
      // SAFETY: this test created a configurable flag; reflection restores its original absence exactly.
      // oxlint-disable-next-line no-restricted-globals
      Reflect.deleteProperty(process, "windowsStore")
    }

    mock.restore()
  }
})
