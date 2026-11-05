import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers"
import type { DictationRequest, DictationResponse } from "./protocol"

env.allowLocalModels = false

env.useBrowserCache = true

const wasm = env.backends.onnx.wasm

if (wasm) {
  wasm.numThreads = 1
  wasm.proxy = false
}

let model: AutomaticSpeechRecognitionPipeline | undefined

const reply = (message: DictationResponse) => postMessage(message)

addEventListener("message", (event: MessageEvent<DictationRequest>) => {
  void handle(event.data).catch(() => reply({ type: "error" }))
})

async function handle(request: DictationRequest) {
  if (request.type === "prepare") {
    model ??= await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
      device: "wasm",
      dtype: "q8",
    })
    reply({ type: "ready" })

    return
  }

  if (!model) return reply({ type: "error" })

  if (!request.audio.some((sample) => Math.abs(sample) > 0.01)) return reply({ type: "text", text: "" })

  const result = await model(request.audio, {
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
  })

  reply({ type: "text", text: (Array.isArray(result) ? result.map((part) => part.text).join(" ") : result.text).trim() })
}
