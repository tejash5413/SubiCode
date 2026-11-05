import { Button } from "@opencode/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { showToast, toaster } from "@opencode/ui/toast"
import type { DialogHandle, IpcClient, SetupContext } from "@opencode/plugin/gui"
import type { Updater, UpdaterState } from "@opencode/plugin/gui/updater"
import type definition from "./index"

type Client = IpcClient<typeof Updater.spec>

type Context = SetupContext<typeof definition>

/** Confirms a manual GitHub download, or restarts into an explicitly staged in-app update. */
export function install(ctx: Context, client: Client, checked?: UpdaterState) {
  const download = () => client.install().catch((cause: unknown) => requestFailed(ctx, cause))

  // A check's reply can arrive before its state broadcast reaches the renderer.
  const state = checked ?? client.state()

  if (state?.status !== "download-required") {
    void download()

    return
  }

  // Keep Settings mounted beneath the confirmation; replacing its scope also disposes this dialog.
  ctx.dialogs.open(
    (dialog) => <DialogManualDownload ctx={ctx} dialog={dialog} version={state.version} download={download} />,
  )
}

export async function check(ctx: Context, client: Client) {
  const checking = showToast({ variant: "loading", title: ctx.t("action.checking") })

  const state = await client
    .check({ signal: ctx.signal })
    .catch((cause: unknown) => requestFailed(ctx, cause))
    .finally(() => toaster.dismiss(checking))

  if (!state || ctx.signal.aborted) return

  // Every settled check says what happened; only an install already underway stays quiet.
  switch (state.status) {
    case "download-required":
      return install(ctx, client, state)
    case "up-to-date":
      return void showToast({
        variant: "success",
        icon: () => <Icon name="circle-check" />,
        title: ctx.t("toast.latest.title"),
        description: ctx.t("toast.latest.description", { version: ctx.app.version }),
      })
    case "ready":
      return void showToast({
        title: ctx.t("dialog.ready.title"),
        description: ctx.t("dialog.ready.message", { version: state.version }),
        persistent: true,
        actions: [
          { label: ctx.t("dialog.restart"), variant: "primary", onClick: () => install(ctx, client) },
          { label: ctx.t("dialog.later"), variant: "secondary", onClick: "dismiss" },
        ],
      })
    case "error":
      return void showToast({ title: ctx.t("common.requestFailed"), description: state.message })
  }
}

function requestFailed(ctx: Context, cause: unknown) {
  if (ctx.signal.aborted) return

  showToast({
    title: ctx.t("common.requestFailed"),
    description: cause instanceof Error && cause.message ? cause.message : undefined,
  })
}

function DialogManualDownload(props: {
  ctx: Context
  dialog: DialogHandle
  version: string
  download: () => Promise<void>
}) {
  const ctx = props.ctx

  const download = () => {
    props.dialog.close()
    void props.download()
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("download.title")}
          description={ctx.t("download.description", { version: props.version })}
        />
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="neutral" onClick={() => props.dialog.close()}>
          {ctx.t("common.cancel")}
        </Button>
        <Button type="button" variant="contrast" autofocus onClick={download}>
          {ctx.t("action.download")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
