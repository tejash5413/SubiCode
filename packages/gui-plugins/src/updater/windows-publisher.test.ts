import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { windowsPublisher } from "./windows-publisher"

test("requires a nonempty configured publisher before Windows automatic updates can run", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "subicode-publisher-"))
  const config = path.join(directory, "app-update.yml")

  try {
    expect(await windowsPublisher(config)).toEqual([])

    for (const text of ["provider: github", "publisherName: []", "publisherName: ''", "publisherName: [1]", "publisherName: [", "publisherName: ['   ']"]) {
      await writeFile(config, text)
      expect(await windowsPublisher(config)).toEqual([])
    }

    await writeFile(config, "provider: github\npublisherName: LearnSmart")
    expect(await windowsPublisher(config)).toEqual(["LearnSmart"])
    await writeFile(config, "publisherName: [LearnSmart, LearnSmart Ltd]")
    expect(await windowsPublisher(config)).toEqual(["LearnSmart", "LearnSmart Ltd"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
