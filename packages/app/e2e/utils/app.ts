import { expect, type Page, type Request } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Predicate } from "effect"
import { base64Encode, checksum } from "@opencode/util/encode"

// The mocked default server. Production builds connect to their own origin, so CI points this at the app.
export const SERVER = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

export const REMOTE_SERVER = "http://127.0.0.1:4097"

export const T0 = 1700000000000

export function sessionHref(sessionID: string, server = SERVER) {
  return `/server/${base64Encode(server)}/session/${sessionID}`
}

export function draftHref(draftID: string) {
  return `/new-session?draftId=${encodeURIComponent(draftID)}`
}

// Key of `opencode.window.browser.dat:tabs.panes` entries.
export function tabKey(sessionID: string, server = SERVER) {
  return `${server}\n${sessionHref(sessionID, server)}`
}

// A default-server workspace storage key, as the app writes it for a forward-slash directory without a trailing slash.
export function workspaceKey(directory: string, key: string) {
  const head = directory.slice(0, 12).replace(/[^a-zA-Z0-9._-]/g, "-")

  return `opencode.workspace.${head}.${checksum(directory) ?? "0"}.dat:workspace:${key}`
}

export async function expectPath(page: Page, href: string) {
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
}

export type TabSeed =
  | string
  | { session: string; server?: string }
  | { draft: string; directory: string; server?: string }

type SeedValue = string | number | boolean | null | undefined | SeedValue[] | SeedRecord

type SeedRecord = { [key: string]: SeedValue }

export type SeedInput = {
  servers?: (string | { url: string; name?: string })[]
  // Project IDs this client has used, which Home lists. Key `local` is the default server; other keys are origins.
  usedProjects?: Record<string, string[]>
  // The directory list builds before the server-backed list kept, which the app migrates to used projects.
  legacyProjects?: Record<string, { worktree: string; expanded?: boolean }[]>
  // A string is a session ID on the default server.
  tabs?: TabSeed[]
  // Keyed by session ID on the default server.
  panes?: Record<string, SeedRecord>
  settings?: SeedRecord
  locale?: string
  theme?: { id: string; scheme: "light" | "dark" }
  // Any other storage key. Strings are written as is, other values as JSON.
  storage?: SeedRecord
}

const seeds = { next: 0 }

// Writes browser storage before the app boots, once per tab: reloads and later navigations keep what the app stored.
// Object values merge one level deep into what an earlier seed wrote, so several helpers can seed one key.
export async function seed(page: Page, input: SeedInput) {
  await page.addInitScript(
    ({ marker, entries }) => {
      if (window.top !== window) return

      if (sessionStorage.getItem(marker)) return
      sessionStorage.setItem(marker, "1")

      const plain = (value: SeedValue): value is SeedRecord =>
        value !== null && value !== undefined && Object(value) === value && !Array.isArray(value)

      entries.forEach(([key, value, merge]) => {
        const current: SeedValue = merge ? JSON.parse(localStorage.getItem(key) ?? "null") : undefined

        if (!plain(current)) return localStorage.setItem(key, value)
        const next: SeedRecord = JSON.parse(value)

        const merged = Object.entries({ ...current, ...next }).map(([field, item]) => {
          const before = current[field]
          const after = next[field]

          return [field, plain(before) && plain(after) ? { ...before, ...after } : item]
        })

        localStorage.setItem(key, JSON.stringify(Object.fromEntries(merged)))
      })
    },
    { marker: `opencode.e2e.seed.${seeds.next++}`, entries: storageEntries(input) },
  )
}

function storageEntries(input: SeedInput): [string, string, boolean][] {
  const server: SeedRecord = {}

  if (input.usedProjects) server.usedProjectIDs = input.usedProjects

  if (input.legacyProjects) server.projects = input.legacyProjects

  if (input.servers) server.list = input.servers.map((item) =>
    Predicate.isString(item) ? item : { type: "http", displayName: item.name, http: { url: item.url } })

  const values: SeedRecord = {}
  Object.assign(values, input.storage)

  if (Object.keys(server).length) values["opencode.global.dat:server"] = server

  if (input.tabs) values["opencode.window.browser.dat:tabs"] = input.tabs.map(tabEntry)

  if (input.panes) values["opencode.window.browser.dat:tabs.panes"] = Object.fromEntries(
    Object.entries(input.panes).map(([sessionID, pane]) => [tabKey(sessionID), pane]))

  if (input.settings) values["settings.v3"] = input.settings

  if (input.locale) values["opencode.global.dat:language"] = { locale: input.locale }

  if (input.theme) {
    values["subi-theme-id"] = input.theme.id
    values["subi-color-scheme"] = input.theme.scheme
  }

  return Object.entries(values).map(([key, value]) => [
    key.includes(".dat:") && key.startsWith("opencode.")
      ? `subi:${key}`
      : key === "settings.v3"
        ? "subi:default:settings.v3"
        : key,
    Predicate.isString(value) ? value : JSON.stringify(value),
    Predicate.isObject(value),
  ])
}

function tabEntry(tab: TabSeed) {
  if (Predicate.isString(tab)) return { type: "session", server: SERVER, sessionId: tab }

  if ("session" in tab) return { type: "session", server: tab.server ?? SERVER, sessionId: tab.session }

  return { type: "draft", draftID: tab.draft, server: tab.server ?? SERVER, directory: tab.directory }
}

export function project(input: { id: string; directory: string; name?: string } & SeedRecord) {
  const { directory, ...rest } = input

  return {
    worktree: directory,
    canonical: directory,
    name: directory.split(/[\\/]/).at(-1),
    vcs: "git",
    time: { created: T0, updated: T0, active: T0 },
    sandboxes: Array<string>(),
    ...rest,
  }
}

export function session(
  input: { id: string; directory: string; title?: string; projectID?: string; created?: number } & SeedRecord,
) {
  const { created = T0, ...rest } = input

  return {
    slug: input.id,
    title: input.id,
    version: "dev",
    time: { created, updated: created },
    ...rest,
  }
}

export type ModelSeed = { id: string; name: string } & SeedRecord

// A connected `opencode` provider whose first model is the default.
export function provider(...models: ModelSeed[]) {
  const all = models.length ? models : [{ id: "test", name: "Test" }]

  return {
    all: [
      {
        id: "opencode",
        name: "OpenCode",
        models: Object.fromEntries(all.map((model) => [model.id, { limit: { context: 200_000 }, ...model }])),
      },
    ],
    connected: ["opencode"],
    default: { providerID: "opencode", modelID: all[0]!.id },
  }
}

export const NO_PROVIDER = { all: [], connected: [], default: {} }

// Pages oldest-first history the way the server does: newest `limit` items before the cursor.
export function pageMessagesFrom(messages: Record<string, SessionMessageInfo[]>) {
  return (sessionID: string, limit: number, before?: string) => {
    const items = messages[sessionID] ?? []

    const end = before
      ? Math.max(
          0,
          items.findIndex((message) => message.id === before),
        )
      : items.length

    const start = Math.max(0, end - limit)

    return { items: items.slice(start, end), cursor: start > 0 ? items[start]!.id : undefined }
  }
}

// Holds matching requests (never CORS preflights) until `release()`, then passes them to earlier routes such as the mock server.
export async function holdRoute(
  page: Page,
  url: string | RegExp | ((url: URL) => boolean),
  options: { method?: string } = {},
) {
  const released = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<Request>()
  const requests: Request[] = []
  await page.route(url, async (route) => {
    const method = route.request().method()

    if (method === "OPTIONS" || (options.method && method !== options.method)) return route.fallback()
    requests.push(route.request())
    arrived.resolve(route.request())
    await released.promise
    await route.fallback().catch(() => undefined)
  })

  return { requests, arrived: arrived.promise, release: () => released.resolve() }
}
