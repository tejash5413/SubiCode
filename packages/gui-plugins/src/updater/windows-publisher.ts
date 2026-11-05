import { readFile } from "node:fs/promises"
import { Schema } from "effect"
import { parse } from "yaml"

const publisherConfig = Schema.Struct({
  publisherName: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
})

/** Read electron-builder's signer identity; unsigned or invalid configurations cannot enable Windows updates. */
export async function windowsPublisher(configFile: string) {
  const config = await readFile(configFile, "utf8")
    .then((text) => Schema.decodeUnknownSync(publisherConfig)(parse(text)))
    .catch(() => undefined)

  if (!config) return []
  const names = Array.isArray(config.publisherName) ? config.publisherName : [config.publisherName]

  return names.every((name) => name.trim().length > 0) ? names : []
}
