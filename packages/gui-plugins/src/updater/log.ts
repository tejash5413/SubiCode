import type { MainContext } from "@opencode/plugin/gui/main"
import { Effect, Layer, Logger, Predicate, References, Types } from "effect"

/** Services for running the updater's effects: every log goes to the desktop log file, debug included. */
export function logContext(log: MainContext["log"]["write"]) {
  const logger = Logger.make((options) => {
    const entry = Logger.formatStructured.log(options)
    const [message, ...details] = Array.isArray(options.message) ? options.message : [options.message]
    const detail = details.length === 1 && Predicate.isObject(details[0]) ? details[0] : details.length ? { details } : {}
    const data: Types.Mutable<NonNullable<Parameters<typeof log>[2]>> = { ...detail }

    if (Object.keys(entry.annotations).length > 0) data.annotations = entry.annotations

    if (entry.cause !== undefined) data.cause = entry.cause

    log(LEVELS[options.logLevel], String(message), data)
  })

  return Effect.runSync(
    Effect.context<never>().pipe(
      Effect.provide(
        Layer.merge(
          Logger.layer([logger], { mergeWithExisting: false }),
          Layer.succeed(References.MinimumLogLevel, "All"),
        ),
      ),
    ),
  )
}

const LEVELS = {
  All: "info",
  None: "info",
  Trace: "debug",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "error",
} as const
