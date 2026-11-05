import { expect, test } from "bun:test"
import wsl from "./wsl"
import ssh from "./ssh"
import updater from "./updater"
import { Predicate } from "effect"

for (const [name, definition] of [["wsl", wsl], ["ssh", ssh], ["updater", updater]] as const) {
  test(`${name} presents SubiCode in English and lazy French copy`, async () => {
    const catalog = definition.i18n

    if (!catalog) throw new Error("Built-in plugin is missing its catalog")
    const english = catalog.en
    expect(Object.values(english).join("\n")).not.toContain("OpenCode")
    const french = catalog.fr
    const messages = Predicate.isFunction(french) ? (await french()).default : french
    expect(Object.values(messages).join("\n")).not.toContain("OpenCode")
    // Locales may omit keys: the host fills those from English.
    expect(Object.keys(english)).toEqual(expect.arrayContaining(Object.keys(messages)))
  })
}
