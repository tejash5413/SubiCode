import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { publicNpmArchive } from "./npm-publication.mjs"

test("registry acceptance is insufficient until the exact qualified archive can be downloaded", async () => {
  const item = { name: "@subicodeagent/subi-cli-linux-arm64", integrity: "sha512-YWJjZA==" }
  const state = { metadata: 200, archive: 404, integrity: item.integrity, version: "2.0.2", foreign: false }
  const server = createServer((request, response) => {
    if (request.url.endsWith(".tgz")) { response.writeHead(state.archive); response.end("x"); return }
    response.writeHead(state.metadata, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ name: item.name, version: state.version,
      dist: { integrity: state.integrity, tarball: (state.foreign ? "https://example.com" : `http://127.0.0.1:${server.address().port}`) + "/archive.tgz" } }))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const registry = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal(await publicNpmArchive(registry, item, "2.0.2"), false)
    state.archive = 206
    assert.equal(await publicNpmArchive(registry, item, "2.0.2"), true)
    state.integrity = "sha512-Y2hhbmdlZA=="
    await assert.rejects(publicNpmArchive(registry, item, "2.0.2"))
    state.integrity = item.integrity; state.version = "2.0.1"
    await assert.rejects(publicNpmArchive(registry, item, "2.0.2"))
    state.version = "2.0.2"; state.foreign = true
    await assert.rejects(publicNpmArchive(registry, item, "2.0.2"))
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
