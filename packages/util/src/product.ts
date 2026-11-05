const website = "https://stlearnsmart.in/subi-code"
const documentation = `${website}/docs`
const repository = { owner: "tejash5413", repo: "SubiCode" }
declare const OPENCODE_VERSION: string

/** Distribution identity. Internal OpenCode protocol and package IDs remain compatible. */
export const Product = {
  name: "SubiCode",
  // Public product version; runtime build IDs stay separate for compatibility and diagnostics.
  version: typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "2.0.2",
  website,
  documentation,
  repository: `https://github.com/${repository.owner}/${repository.repo}`,
  guides: {
    models: `${documentation}#models`,
    settings: `${documentation}#settings`,
    mcp: `${documentation}#mcp`,
    plugins: `${documentation}#plugins`,
    skills: `${documentation}#skills`,
  },
  support: "https://stlearnsmart.in/contact",
  command: "subi",
  directory: "subi-code",
  updates: {
    cli: {
      enabled: true,
      package: "@subicodeagent/subi-cli",
      registry: "https://registry.npmjs.org",
    },
    desktop: {
      enabled: true,
      // Notify and open GitHub; users download and run installers themselves.
      installInApp: false,
      feed: { provider: "github", ...repository, releaseType: "release" },
      releaseNotes: `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases?per_page=100`,
    },
  },
  // Separate from our own feeds: never install upstream OpenCode builds over SubiCode.
  upstreamUpdates: false,
} as const

/** Apply only to first-party UI copy, never user content, identifiers, or provider responses. */
export function brandCopy(value: string) {
  return value
    .replace(/OpenCode/g, Product.name)
    .replace(/\bwww\.opencode\.ai\b/g, "stlearnsmart.in")
    .replace(/\s*[(（]opencode\.jsonc?[)）]/g, "")
    .replace(
      /\bopencode(?= (?:--|pair\b|service\b|upgrade\b|mcp\b|plugin\b|auth\b|run\b|web\b|serve\b|stats\b|mini\b))/g,
      Product.command,
    )
    .replace(/'opencode' command/g, `'${Product.command}' command`)
    .replace(/(?<![@./])\bopencode\b(?![/:_-]|\.[A-Za-z0-9])/g, Product.name)
}

/** Preserve translation keys and placeholders while adapting inherited product copy. */
export function brandMessages<T extends Record<string, string>>(value: T): { [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [key, brandMessage(key, text)])) as {
    [K in keyof T]: string
  }
}

function brandMessage(key: string, text: string) {
  if (key === "desktop.cli.installed.message") return brandCopy(text.replace(/\bopencode2\b/gi, Product.command))
  // Product names can be inflected or followed by a language-specific suffix.
  // These two catalog entries contain prose, not executable paths or package IDs.
  if (key === "error.opencodeMissing" || key === "error.opencodeCannotRun")
    return brandCopy(text.replace(/opencode/gi, Product.name))
  if (key.startsWith("project.settings.worktree.startup.hint."))
    return brandCopy(text.replace(/\$OPENCODE_WORKTREE_(BASE|PATH)\b/g, "$$SUBI_WORKTREE_$1"))
  return brandCopy(
    key === "settings.extensions.manageConfig" ? text.replace(/\bopencode\.jsonc?\b/g, Product.name) : text,
  )
}
