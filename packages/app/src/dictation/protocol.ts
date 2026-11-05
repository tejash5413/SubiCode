export type DictationRequest = { type: "prepare" } | { type: "transcribe"; audio: Float32Array }

export type DictationResponse = { type: "ready" } | { type: "text"; text: string } | { type: "error" }

export type DictationError = "permission" | "unavailable" | "download" | "transcription" | "empty" | "delivery"

export type DictationState = {
  status: "idle" | "preparing" | "recording" | "transcribing" | "complete" | "error"
  text: string
  error?: DictationError
}
