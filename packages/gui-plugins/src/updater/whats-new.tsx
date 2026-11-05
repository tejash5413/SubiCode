import { createSignal, Index, Show } from "solid-js"
import { Option, Schema } from "effect"
import { Product } from "@opencode/util/product"
import { Button } from "@opencode/ui/button"
import { Dialog } from "@opencode/ui/dialog"
import { usePlugin, type DialogHandle, type SetupContext } from "@opencode/plugin/gui"
import type definition from "./index"
import { ReleaseNotes, releaseHighlights, type ReleaseHighlight } from "./release-notes"

const decodeReleaseNotes = Schema.decodeUnknownOption(ReleaseNotes)

/**
 * Shows the desktop highlights of the releases since `previous` once the changelog loads, and remembers the current
 * version as seen. A changelog without highlights only remembers the version; a failed request leaves it for the next
 * start.
 */
export function showWhatsNew(
  ctx: SetupContext<typeof definition>,
  input: { readonly previous: string; readonly current: string; readonly markSeen: () => void },
) {
  const timers = new Set<ReturnType<typeof setTimeout>>()

  ctx.signal.addEventListener("abort", () => timers.forEach(clearTimeout))

  fetch(Product.updates.desktop.releaseNotes, {
    signal: ctx.signal,
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((json) => {
      if (!json) return

      const highlights = Option.match(decodeReleaseNotes(json), {
        onNone: () => [],
        onSome: (releases) => releaseHighlights(releases, input.current, input.previous),
      })

      if (ctx.signal.aborted) return

      if (highlights.length === 0) return input.markSeen()

      timers.add(
        setTimeout(() => {
          input.markSeen()
          ctx.dialogs.open((dialog) => <DialogReleaseNotes highlights={highlights} dialog={dialog} />, {
            replace: true,
          })
        }, 500),
      )
    })
    .catch(() => undefined)
}

function DialogReleaseNotes(props: { highlights: ReleaseHighlight[]; dialog: DialogHandle }) {
  const ctx = usePlugin<typeof definition>()
  const [index, setIndex] = createSignal(0)

  const total = () => props.highlights.length
  const last = () => Math.max(0, total() - 1)
  const feature = () => props.highlights[index()] ?? props.highlights[last()]
  const isFirst = () => index() === 0
  const isLast = () => index() >= last()
  const paged = () => total() > 1

  function handleNext() {
    if (isLast()) return

    setIndex(index() + 1)
  }

  function handleClose() {
    props.dialog.close()
  }

  function handleDisable() {
    ctx.stores.releaseNotes.update((draft) => {
      draft.enabled = false
    })
    handleClose()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      handleClose()

      return
    }

    if (!paged()) return

    if (e.key === "ArrowLeft" && !isFirst()) {
      e.preventDefault()
      setIndex(index() - 1)
    }

    if (e.key === "ArrowRight" && !isLast()) {
      e.preventDefault()
      setIndex(index() + 1)
    }
  }

  return (
    <Dialog
      size="large"
      fit
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),400px)] -mt-20 min-h-0 overflow-hidden"
    >
      <div class="flex flex-1 min-w-0 min-h-0" tabIndex={0} autofocus onKeyDown={handleKeyDown}>
        {/* Left side - Text content */}
        <div class="flex flex-col flex-1 min-w-0 p-8">
          {/* Top section - feature content (fixed position from top) */}
          <div class="flex flex-col flex-1 min-h-0 gap-2 pt-6 overflow-y-auto" data-scrollable>
            <div class="flex items-center gap-2">
              <h1 class="text-16-medium text-text-strong">{feature()?.title ?? ""}</h1>
            </div>
            <p class="text-14-regular text-text-base whitespace-pre-wrap break-words">{feature()?.description ?? ""}</p>
          </div>

          {/* Spacer to push buttons to bottom */}
          <div class="flex-1" />

          {/* Bottom section - buttons and indicators (fixed position) */}
          <div class="flex flex-col gap-12">
            <div class="flex flex-col items-start gap-3">
              <Show
                when={isLast()}
                fallback={
                  <Button variant="neutral" size="large" onClick={handleNext}>
                    {ctx.t("releaseNotes.action.next")}
                  </Button>
                }
              >
                <Button variant="contrast" size="large" onClick={handleClose}>
                  {ctx.t("releaseNotes.action.getStarted")}
                </Button>
              </Show>

              <Button variant="ghost" size="small" onClick={handleDisable}>
                {ctx.t("releaseNotes.action.hideFuture")}
              </Button>
            </div>

            <Show when={paged()}>
              <div class="flex items-center gap-1.5 -my-2.5">
                <Index each={props.highlights}>
                  {(_, i) => (
                    <button
                      type="button"
                      class="h-6 flex items-center cursor-pointer bg-transparent border-none p-0 transition-all duration-200"
                      classList={{
                        "w-8": i === index(),
                        "w-3": i !== index(),
                      }}
                      onClick={() => setIndex(i)}
                    >
                      <div
                        class="w-full h-0.5 rounded-[1px] transition-colors duration-200"
                        classList={{
                          "bg-icon-strong-base": i === index(),
                          "bg-icon-weak-base": i !== index(),
                        }}
                      />
                    </button>
                  )}
                </Index>
              </div>
            </Show>
          </div>
        </div>

        {/* Right side - Media content (edge to edge) */}
        <Show when={feature()?.media}>
          {(media) => (
            <div class="flex-1 min-w-0 bg-surface-base overflow-hidden rounded-r-xl">
              <Show
                when={media().type === "image"}
                fallback={
                  <video src={media().src} autoplay loop muted playsinline class="w-full h-full object-cover" />
                }
              >
                <img
                  src={media().src}
                  alt={media().alt ?? feature()?.title ?? ctx.t("releaseNotes.media.alt")}
                  class="w-full h-full object-cover"
                />
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Dialog>
  )
}
