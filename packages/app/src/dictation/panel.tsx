import { Show, createEffect, createUniqueId, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Loader } from "@opencode/ui/loader"
import { createDictation } from "./controller"
import type { DictationKey } from "./messages"
import type { DictationState } from "./protocol"
import "./dictation.css"

export function DictationPanel(props: {
  t: (key: DictationKey) => string
  onUse: (text: string) => void | Promise<void>
  onCancel: () => void
  heading?: JSX.Element
}) {
  const id = createUniqueId()

  const [state, setState] = createStore<DictationState & { seconds: number; sending: boolean }>({
    status: "idle", text: "", seconds: 0, sending: false,
  })

  const recorder = createDictation((change) => setState(change))
  const busy = () => state.status === "preparing" || state.status === "transcribing" || state.sending

  onCleanup(recorder.cancel)

  createEffect(() => {
    if (state.status !== "recording") return
    setState("seconds", 0)
    const timer = setInterval(() => setState("seconds", (value) => value + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const primary = () => {
    if (state.status === "recording") return recorder.stop()

    if (state.status !== "complete") return recorder.start()

    const text = state.text.trim()

    if (!text || state.sending) return

    setState("sending", true)
    void Promise.resolve().then(() => props.onUse(text))
      .catch(() => setState("error", "delivery"))
      .finally(() => setState("sending", false))
  }

  const primaryLabel = () => {
    if (state.status === "recording") return props.t("dictation.stop")

    if (state.status === "preparing") return props.t("dictation.preparing")

    if (state.status === "transcribing") return props.t("dictation.transcribing")

    if (state.status === "complete") return props.t("dictation.use")

    if (state.status === "error") return props.t("dictation.retry")

    return props.t("dictation.start")
  }

  return (
    <section class="subi-dictation" aria-labelledby={`${id}-title`} data-scrollable>
      <div id={`${id}-title`}>{props.heading ?? <h2>{props.t("dictation.title")}</h2>}</div>
      <p>{props.t("dictation.description")}</p>
      <p class="subi-dictation-note">{props.t("dictation.local")}</p>
      <div class="subi-dictation-status" role="status" aria-live="polite">
        <Show when={busy()}><Loader /></Show>
        <Show when={state.status === "preparing"}>{props.t("dictation.preparing")}</Show>
        <Show when={state.status === "transcribing"}>{props.t("dictation.transcribing")}</Show>
        <Show when={state.status === "recording"}>
          <span class="subi-dictation-recording" aria-hidden="true" />
          {props.t("dictation.listening")} {`${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")}`}
        </Show>
      </div>
      <Show when={state.error}>
        {(error) => <p role="alert">{props.t(`dictation.error.${error()}`)}</p>}
      </Show>
      <Show when={state.status === "complete"}>
        <label for={`${id}-text`}>{props.t("dictation.transcript")}</label>
        <textarea id={`${id}-text`} rows={5} value={state.text} disabled={state.sending}
          onInput={(event) => setState("text", event.currentTarget.value)} />
      </Show>
      <p class="subi-dictation-note">{props.t("dictation.limit")}</p>
      <div class="subi-dictation-buttons">
        <button type="button" onClick={props.onCancel}>{props.t("dictation.cancel")}</button>
        <button type="button" class="subi-dictation-primary" onClick={primary}
          disabled={busy() || (state.status === "complete" && !state.text.trim())}>{primaryLabel()}</button>
      </div>
    </section>
  )
}

export function MicrophoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </svg>
  )
}
