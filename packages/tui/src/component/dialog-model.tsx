import type { ModelInfo } from "@opencode/client"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { LearnSmartAccount } from "@opencode/schema/learnsmart-account"
import { useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogIntegration } from "./dialog-integration"
import { DialogVariant } from "./dialog-variant"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"
import { useData } from "../context/data"
import { modelPreferenceKey } from "../model-preference"
import { useLocation } from "../context/location"
import { useNewDesigns } from "../config"
import { useClient } from "../context/client"
import { useToast } from "../ui/toast"
import { FavoriteMarker, ModelDetail, isFreeModel, prioritizeFavorites, sortModelOptions } from "./model-options"
import { DialogUsage, useUsageLimits } from "./usage"
import { formatDollars, usageLevel } from "../util/usage-limits"

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const dialog = useDialog()

  function select(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.current()
    if (cur && list.includes(cur)) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  function connect() {
    dialog.replace(() => (
      <DialogIntegration onConnected={(providerID) => dialog.replace(() => <DialogModel providerID={providerID} />)} />
    ))
  }

  return <DialogConnectedModels providerID={props.providerID} onSelect={select} onConnect={connect} />

}

function DialogConnectedModels(props: {
  providerID?: string
  onSelect: (providerID: string, modelID: string) => void
  onConnect: () => void
}) {
  const local = useLocal()
  const newDesigns = useNewDesigns()
  const data = useData()
  const location = useLocation()
  const dialog = useDialog()
  const limits = useUsageLimits()
  // Spend moves with every request, so the picker shows fresh limits.
  onMount(() => limits.load(true))
  const usage = (model: ModelInfo) => {
    const value = limits.usage(model)
    if (value) {
      const level = usageLevel(value, model)
      return { text: `${formatDollars(value.left)} left`, danger: level === "out" || level === "reached" }
    }
    if (limits.unlimited(model)) return { text: "No limit" }
    return undefined
  }
  const [query, setQuery] = createSignal("")
  // Under new designs, favoriting does not reorder the list until the dialog is reopened.
  const favoritesAtOpen = [...local.model.favorite()]
  const favoritePriority = new Set(favoritesAtOpen.map(modelPreferenceKey))
  const isFavorite = (value: { providerID: string; modelID: string } | undefined) =>
    value !== undefined &&
    local.model.favorite().some((item) => item.providerID === value.providerID && item.modelID === value.modelID)
  // Under new designs the detail row shows the price, so the trailing slot only marks favorites.
  const trailing = (model: ModelInfo, favorite: boolean) => {
    if (newDesigns()) return favorite ? <FavoriteMarker /> : undefined
    return isFreeModel(model) ? "Free" : undefined
  }
  // OpenCode's own free models get their own group at the end of the list instead of joining "OpenCode".
  const freeGroup = (model: ModelInfo) =>
    newDesigns() && !props.providerID && model.providerID === "opencode" && isFreeModel(model)
  const client = useClient()
  const toast = useToast()
  const [refreshing, setRefreshing] = createSignal(false)
  let request: AbortController | undefined
  onCleanup(() => request?.abort())

  const connected = useConnected()
  const providers = createMemo(
    () => new Map((data.location.provider.list(location.ref) ?? []).map((item) => [item.id, item])),
  )
  const models = createMemo(() => data.location.model.list(location.ref) ?? [])

  const showExtra = createMemo(() => connected() && !props.providerID)

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? (newDesigns() ? favoritesAtOpen : local.model.favorite()) : []
    const recents = local.model.recent()

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return items.flatMap((item) => {
        const model = models().find((model) => model.providerID === item.providerID && model.id === item.modelID)
        if (!model) return []
        const provider = providers().get(model.providerID)
        return [
          {
            key: item,
            value: { providerID: model.providerID, modelID: model.id },
            title: model.name,
            releaseDate: model.time.released,
            description: provider?.name ?? model.providerID,
            category,
            footer: trailing(model, isFavorite(item)),
            detail: newDesigns() ? () => <ModelDetail model={model} usage={usage(model)} /> : undefined,
            onSelect: () => {
              props.onSelect(model.providerID, model.id)
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(favorites, "Favorites")
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    const modelOptions = sortModelOptions(
      models()
        .filter((model) => model.status !== "deprecated")
        .filter((model) => (props.providerID ? model.providerID === props.providerID : true))
        .map((model) => {
          const provider = providers().get(model.providerID)
          const value = { providerID: model.providerID, modelID: model.id }
          // Users with nothing connected can only favorite models in the free picker (new designs); this picker keeps them unavailable.
          const favorite = connected() && isFavorite(value)
          return {
            value,
            providerID: model.providerID,
            providerName: provider?.name ?? model.providerID,
            title: model.name,
            releaseDate: model.time.released,
            description: newDesigns() ? undefined : favorite ? "(Favorite)" : undefined,
            category: connected() ? (freeGroup(model) ? "Free" : (provider?.name ?? model.providerID)) : undefined,
            footer: trailing(model, favorite),
            free: isFreeModel(model),
            detail: newDesigns() ? () => <ModelDetail model={model} usage={usage(model)} /> : undefined,
            onSelect() {
              props.onSelect(model.providerID, model.id)
            },
          }
        })
        .filter((option) => {
          if (!showSections) return true
          if (
            favorites.some(
              (item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID,
            )
          )
            return false
          if (
            recents.some((item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID)
          )
            return false
          return true
        }),
      connected(),
    )

    if (needle) {
      const results = prioritizeFavorites(
        sortModelOptions(
          fuzzysort.go(needle, modelOptions, { keys: ["title", "category"] }).map((item) => item.obj),
          false,
        ),
        favoritePriority,
      )
      // Search results name the provider inline. Without a category, the trailing slot keeps the favorite marker
      // instead of falling back to the provider name.
      if (!newDesigns()) return results
      return results.map((option) => ({ ...option, description: option.providerName, category: undefined }))
    }

    return [
      ...favoriteOptions,
      ...recentOptions,
      ...modelOptions.filter((option) => option.category !== "Free"),
      ...modelOptions.filter((option) => option.category === "Free"),
    ]
  })

  const provider = createMemo(() => (props.providerID ? providers().get(props.providerID) : undefined))

  const title = createMemo(() => {
    const value = provider()
    if (!value) return "Select model"
    return value.name
  })

  async function refresh() {
    if (refreshing()) return
    const controller = new AbortController()
    request = controller
    setRefreshing(true)
    try {
      data.location.integration.invalidate(location.ref)
      await data.location.integration.sync(location.ref)
      if (controller.signal.aborted) return
      const managed = data.location.integration
        .list(location.ref)
        ?.some((integration) => integration.id === "learnsmart" && integration.connections.length > 0)
      const account = managed
        ? await client.api.rpc(LearnSmartAccount.Contract).get(
            {},
            {
              location: location.ref,
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
            },
          )
        : undefined
      if (controller.signal.aborted) return
      data.location.model.invalidate(location.ref)
      data.location.provider.invalidate(location.ref)
      await Promise.all([data.location.model.sync(location.ref), data.location.provider.sync(location.ref)])
      if (controller.signal.aborted) return
      toast.show(
        account && !account.inferenceAvailable
          ? { variant: "warning", message: "LearnSmart models unavailable. Open /account for details." }
          : models().length === 0
            ? { variant: "warning", message: "No models available. Check your connected accounts." }
            : { variant: "success", message: "Models refreshed" },
      )
    } catch {
      if (!controller.signal.aborted)
        toast.show({ variant: "error", message: "Unable to refresh models. Try Refresh again." })
    } finally {
      if (!controller.signal.aborted) setRefreshing(false)
    }
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      searchInTitle
      titlePlaceholder="Search models"
      options={options()}
      actions={[
        {
          command: "model.dialog.refresh",
          title: refreshing() ? "Refreshingâ€¦" : newDesigns() ? "refresh" : "Refresh",
          selection: "none",
          disabled: refreshing(),
          onTrigger: () => void refresh(),
        },
        {
          command: "model.dialog.provider",
          title: newDesigns()
            ? connected()
              ? "connect integration"
              : "view all integrations"
            : connected()
              ? "Connect an integration"
              : "View all integrations",
          selection: "none",
          onTrigger: props.onConnect,
        },
        {
          command: "model.dialog.usage",
          title: newDesigns() ? "usage" : "Usage",
          selection: "none",
          hidden: !limits.info(),
          onTrigger: () => dialog.replace(() => <DialogUsage />),
        },
        {
          command: "model.dialog.favorite",
          title: newDesigns() ? (option) => (isFavorite(option?.value) ? "unfavorite" : "favorite") : "Favorite",
          hidden: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title={title()}
      current={local.model.current()}
    />
  )
}
