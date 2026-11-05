import type { DictationError, DictationRequest, DictationResponse, DictationState } from "./protocol"

type DictationResources = {
  worker?: Worker
  recorder?: MediaRecorder
  stream?: MediaStream
  audio?: AudioContext
  timer?: ReturnType<typeof setTimeout>
  generation: number
  status: DictationState["status"]
}

/** Owns one microphone recording. Closing it discards pending results and releases the microphone and worker. */
export function createDictation(change: (state: DictationState) => void) {
  const resources: DictationResources = { generation: 0, status: "idle" }

  const publish = (status: DictationState["status"], text = "", error?: DictationError) => {
    resources.status = status
    change({ status, text, error })
  }

  const release = () => {
    clearTimeout(resources.timer)
    resources.timer = undefined
    resources.stream?.getTracks().forEach((track) => track.stop())
    resources.stream = undefined

    if (resources.recorder) {
      resources.recorder.onstop = null
      resources.recorder.ondataavailable = null
      resources.recorder.onerror = null

      if (resources.recorder.state !== "inactive") resources.recorder.stop()
      resources.recorder = undefined
    }

    resources.worker?.terminate()
    resources.worker = undefined
    void resources.audio?.close().catch(() => undefined)
    resources.audio = undefined
  }

  const fail = (generation: number, error: DictationError) => {
    if (generation !== resources.generation) return
    ++resources.generation
    release()
    publish("error", "", error)
  }

  const stop = () => {
    if (resources.recorder?.state === "recording") resources.recorder.stop()
  }

  const record = async (generation: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })

    if (generation !== resources.generation) {
      stream.getTracks().forEach((track) => track.stop())

      return
    }

    resources.stream = stream
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    resources.recorder = recorder
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }

    recorder.onerror = () => fail(generation, "unavailable")
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      resources.stream = undefined
      clearTimeout(resources.timer)

      if (generation !== resources.generation) return

      publish("transcribing")
      resources.timer = setTimeout(() => fail(generation, "transcription"), 180_000)
      void transcribe(new Blob(chunks, { type: recorder.mimeType }), generation).catch(() => fail(generation, "transcription"))
    }

    recorder.start(250)
    publish("recording")
    resources.timer = setTimeout(stop, 90_000)
  }

  const transcribe = async (blob: Blob, generation: number) => {
    if (!blob.size) return fail(generation, "empty")

    const audio = new AudioContext({ sampleRate: 16_000 })
    resources.audio = audio
    const decoded = await audio.decodeAudioData(await blob.arrayBuffer())

    if (generation !== resources.generation) return
    const samples = decoded.getChannelData(0).slice()

    for (let channel = 1; channel < decoded.numberOfChannels; channel++) {
      const next = decoded.getChannelData(channel)

      for (let i = 0; i < samples.length; i++) samples[i] += next[i]
    }

    if (decoded.numberOfChannels > 1)
      for (let i = 0; i < samples.length; i++) samples[i] /= decoded.numberOfChannels

    await audio.close()
    resources.audio = undefined

    if (generation !== resources.generation) return
    const message: DictationRequest = { type: "transcribe", audio: samples }
    resources.worker?.postMessage(message, [samples.buffer])
  }

  return {
    start() {
      ++resources.generation
      release()
      const generation = resources.generation

      if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window) || !("Worker" in window))
        return fail(generation, "unavailable")

      publish("preparing")

      try {
        const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })
        resources.worker = worker
        resources.timer = setTimeout(() => fail(generation, "download"), 180_000)
        worker.onerror = () => fail(generation, resources.status === "preparing" ? "download" : "transcription")
        worker.onmessage = (event: MessageEvent<DictationResponse>) => {
          if (generation !== resources.generation) return
          const message = event.data

          if (message.type === "error")
            return fail(generation, resources.status === "preparing" ? "download" : "transcription")

          if (message.type === "ready") {
            clearTimeout(resources.timer)
            void record(generation).catch((error) => fail(generation,
              error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)
                ? "permission" : "unavailable"))

            return
          }

          const text = message.text.trim()

          if (!text) return fail(generation, "empty")
          ++resources.generation
          release()
          publish("complete", text)
        }

        worker.postMessage({ type: "prepare" } satisfies DictationRequest)
      } catch {
        fail(generation, "unavailable")
      }
    },
    stop,
    cancel() {
      ++resources.generation
      release()
      publish("idle")
    },
  }
}
