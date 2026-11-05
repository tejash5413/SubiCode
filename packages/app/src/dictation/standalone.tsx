import { render } from "solid-js/web"
import { Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { ThemeProvider } from "@opencode/ui/theme"
import { Product } from "@opencode/util/product"
import { dictationMessages } from "./messages"
import { DictationPanel } from "./panel"
import "@/index.css"

function VoiceTypingWindow() {
  const token = location.hash.slice(1)

  const [state, setState] = createStore<{ phase: "active" | "sent" | "closed"; error: boolean }>({
    phase: token ? "active" : "closed", error: false,
  })

  const cancel = () => {
    if (state.phase !== "active") return

    setState("phase", "closed")
    navigator.sendBeacon("/cancel", JSON.stringify({ token }))
  }

  window.addEventListener("pagehide", cancel)
  onCleanup(() => window.removeEventListener("pagehide", cancel))

  if (token) {
    const events = new EventSource(`/events?token=${encodeURIComponent(token)}`)
    events.addEventListener("closed", (event: MessageEvent<string>) => {
      events.close()
      setState("phase", event.data === "used" ? "sent" : "closed")
    })
    events.onerror = () => {
      events.close()

      if (state.phase === "active") setState("phase", "closed")
    }

    onCleanup(() => events.close())
  }

  return (
    <main class="subi-dictation-window">
      <div class="subi-dictation-card">
        <div class="subi-dictation-brand">{Product.name}</div>
        <Show when={state.phase === "active"} fallback={
          <p role="status" class="subi-dictation-notice">
            {dictationMessages[state.phase === "sent" ? "dictation.cli.sent" : "dictation.cli.closed"]}
          </p>
        }>
          <Show when={state.error}>
            <p role="alert" class="subi-dictation-notice">{dictationMessages["dictation.cli.failed"]}</p>
          </Show>
          <DictationPanel t={(key) => dictationMessages[key]} onCancel={cancel} onUse={async (text) => {
            const response = await fetch("/result", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, text }) }).catch(() => undefined)

            if (!response?.ok) {
              setState("error", true)

              return
            }

            setState("phase", "sent")
          }} />
        </Show>
      </div>
    </main>
  )
}

const root = document.getElementById("root")

if (root) render(() => <ThemeProvider><VoiceTypingWindow /></ThemeProvider>, root)
