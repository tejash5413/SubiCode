import { brandMessages } from "@opencode/util/product"
import { builtinCatalog, type BuiltinCatalog } from "@opencode/plugin/gui/builtin"
import type { Catalog, Messages } from "@opencode/plugin/gui"
import { Predicate } from "effect"

/** Adapt only the catalogs of our shipping features; external extensions keep their own identity. */
export function brandCatalog<const English extends Messages>(
  catalog: BuiltinCatalog & { readonly en: English },
): Catalog & { readonly en: { [K in keyof English]: string } } {
  const localized: Record<string, BuiltinCatalog[string]> = {}

  for (const [locale, source] of Object.entries(catalog)) {
    localized[locale] = Predicate.isFunction(source)
      ? async () => ({ default: brandMessages((await source()).default) })
      : brandMessages(source)
  }

  return { ...builtinCatalog({ ...localized, en: brandMessages(catalog.en) }), en: brandMessages(catalog.en) }
}
