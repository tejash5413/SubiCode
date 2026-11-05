import { Component, createResource, type JSX } from "solid-js"
import { Tabs } from "@opencode/ui/tabs"
import { Product } from "@opencode/util/product"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import type { SettingsView } from "@/settings/surface"
import "@/settings/settings.css"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import { ExtensionPlugins } from "@/runtime/plugin/extension-plugins"
import { ExtensionSources } from "./extension-sources"
import { McpConnections } from "./mcp-connections"

export const SettingsExtensions: Component<{
  directory?: string
  headerAction?: JSX.Element
  subtab?: SettingsView["subtab"]
  onSubtab: (value: SettingsView["subtab"]) => void
}> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const platform = usePlatform()
  const own = () => !!platform.plugins && ServerConnection.builtin(sdk.server)

  const [plugins] = createResource(
    () => sdk.connection.status() === "connected",
    () => sdk.api.plugin.list().then((result) => result.data).catch(() => []),
    { initialValue: [] },
  )

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{language.t("settings.tab.extensions")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.extensions.description")}</span>
          </div>
          <ExternalLink
            class="settings-action-link"
            href={
              { plugins: Product.guides.plugins, skills: Product.guides.skills, mcps: Product.guides.mcp, lsps: Product.guides.mcp }[props.subtab ?? "mcps"]
            }
          >
            {language.t("common.learnMore")}
          </ExternalLink>
          {props.headerAction}
        </div>
      </div>

      <div class="settings-tab-body">
        <Tabs
          variant="pill"
          value={props.subtab ?? "mcps"}
          onChange={(value) => {
            if (value === "mcps" || value === "plugins" || value === "skills") props.onSubtab(value)
          }}
          class="settings-extensions-tabs settings-subtabs"
        >
          <Tabs.List>
            <Tabs.Trigger value="mcps">{language.t("settings.extensions.tab.mcps")}</Tabs.Trigger>
            <Tabs.Trigger value="plugins">{language.t("settings.extensions.tab.plugins")}</Tabs.Trigger>
            <Tabs.Trigger value="skills">{language.t("settings.extensions.tab.skills")}</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="mcps">
            <McpConnections />
          </Tabs.Content>

          <Tabs.Content value="plugins">
            <ExtensionSources kind="plugin" />
            <ExtensionPlugins plugins={plugins.latest ?? []} own={own()} />
          </Tabs.Content>
          <Tabs.Content value="skills">
            <ExtensionSources kind="skill" />
          </Tabs.Content>
        </Tabs>
      </div>
    </>
  )
}
