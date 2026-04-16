import { Storage } from "@plasmohq/storage"
import type { IASRService, TranscriptResult } from "./types"

const storage = new Storage()

export class WhisperService implements IASRService {
    constructor(private configuredApiKey?: string) {}

    async isAvailable(): Promise<boolean> {
        if (this.configuredApiKey) return true
        const apiKey = await storage.get("asrApiKey")
        return !!apiKey
    }

    async transcribe(audioBlob: Blob): Promise<TranscriptResult> {
        const apiKey = this.configuredApiKey || (await storage.get("asrApiKey")) as string
        const apiUrl = (await storage.get("asrApiUrl")) || "https://api.openai.com/v1"
        const model = (await storage.get("asrModel")) || "whisper-1"
        const provider = (await storage.get("asrProvider")) || "OpenAI"

        if (!apiKey) {
            throw new Error("ASR API Key is missing. Please configure it in settings.")
        }

        console.log(`[ASRService] Using provider: ${provider}, model: ${model}, url: ${apiUrl}`)

        if (provider !== "OpenAI" && provider !== "Groq") {
            throw new Error(
                `Provider ${provider} is currently in development for customized handling. Only OpenAI/Groq are fully tested with standard Whisper format.`
            )
        }

        const ext = audioBlob.type.includes("wav") ? "wav"
            : audioBlob.type.includes("mp4") ? "mp4"
            : audioBlob.type.includes("ogg") ? "ogg"
            : "webm"

        const formData = new FormData()
        formData.append("file", audioBlob, `audio.${ext}`)
        formData.append("model", model)
        formData.append("response_format", "verbose_json")
        formData.append("timestamp_granularities[]", "segment")

        const endpoint = `${(apiUrl as string).replace(/\/$/, "")}/audio/transcriptions`
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
        })

        if (!response.ok) {
            const errorData = await response.text()
            console.error("[ASRService] API Error:", errorData)
            throw new Error(`ASR API failed: ${response.statusText}`)
        }

        const json: any = await response.json()
        const rawSegments: any[] = Array.isArray(json?.segments) ? json.segments : []
        const segments = rawSegments
            .map((s) => ({
                start: typeof s.start === "number" ? s.start : 0,
                end: typeof s.end === "number" ? s.end : 0,
                text: typeof s.text === "string" ? s.text.trim() : "",
            }))
            .filter((s) => s.text.length > 0)

        return {
            text: typeof json?.text === "string" ? json.text : segments.map((s) => s.text).join(" "),
            segments,
        }
    }
}
