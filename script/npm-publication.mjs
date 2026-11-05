import assert from "node:assert/strict"

/** A successful publish reply can precede availability of its actual archive. */
export async function publicNpmArchive(registry, item, version) {
  const response = await fetch(`${registry}/${item.name}/${version}`, { signal: AbortSignal.timeout(15000) })
  if ([404, 429, 502, 503].includes(response.status)) return false
  assert.ok(response.ok, `${item.name}: registry returned ${response.status}`)
  const record = await response.json()
  assert.equal(record.name, item.name)
  assert.equal(record.version, version)
  assert.equal(record.dist.integrity, item.integrity, `${item.name}: published bytes differ from qualification`)
  assert.equal(new URL(record.dist.tarball).origin, new URL(registry).origin)
  const archive = await fetch(record.dist.tarball, { headers: { Range: "bytes=0-0", "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000) })
  await archive.body?.cancel()
  if ([404, 429, 502, 503].includes(archive.status)) return false
  assert.ok([200, 206].includes(archive.status), `${item.name}: archive returned ${archive.status}`)
  return true
}
