import { onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTuiApp } from "../context/runtime"
import { useTheme } from "../context/theme"
import { Keymap } from "../context/keymap"
import { DialogHeader, DialogLayout, useDialog } from "../ui/dialog"
import { Link } from "../ui/link"
import { errorMessage } from "../util/error"

export function DialogDictation(props: { onText: (text: string) => void }) {
  const app = useTuiApp()
  const dialog = useDialog()
  const theme = useTheme().surface("dialog")
  const controller = new AbortController()
  const [state, setState] = createStore({ url: "", error: "" })
  onCleanup(() => controller.abort())
  Keymap.createLayer(() => ({ mode: "modal", commands: [
    { bind: "escape", title: "Cancel voice typing", group: "Voice", run: () => dialog.clear() },
  ] }))
  onMount(() => {
    void app.dictate?.({ signal: controller.signal, onReady: (url) => setState("url", url) })
      .then((text) => {
        if (controller.signal.aborted) return

        if (text) props.onText(text)
        dialog.clear()
      }).catch((error) => {
        if (!controller.signal.aborted) setState("error", errorMessage(error))
      })
  })

  return (
    <DialogLayout header={<DialogHeader title="Voice typing" onClose={() => dialog.clear()} />}>
      <box flexDirection="column" gap={1}>
        <text fg={theme.text.base}>Speak in the browser window, review the text, then choose Use text.</text>
        <text fg={theme.text.muted}>Your message stays in this draft until you send it.</text>
        <Show when={state.url}><Link href={state.url}>Open voice typing</Link></Show>
        <Show when={state.error}><text fg={theme.text.feedback.error.base}>{state.error}</text></Show>
        <text fg={theme.text.muted}>Press Esc to cancel.</text>
      </box>
    </DialogLayout>
  )
}
