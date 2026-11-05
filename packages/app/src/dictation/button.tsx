import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogTitleGroup } from "@opencode/ui/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { DictationPanel, MicrophoneIcon } from "./panel"

export function DictationButton(props: { onText: (text: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <button type="button" class="subi-dictation-trigger" title={language.t("dictation.title")}
      aria-label={language.t("dictation.title")} onClick={() => {
        void dialog.show(() => (
          <Dialog size="normal">
            <DictationPanel t={language.t} heading={<DialogTitleGroup title={language.t("dictation.title")} />}
              onCancel={() => dialog.close()} onUse={(text) => {
              props.onText(text)
              dialog.close()
            }} />
          </Dialog>
        ))
      }}>
      <MicrophoneIcon />
    </button>
  )
}
