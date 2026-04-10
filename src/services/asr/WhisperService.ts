import { Storage } from "@plasmohq/storage"
import type { IASRService } from "./types"

const storage = new Storage()

export class WhisperService implements IASRService {
    async isAvailable(): Promise<boolean> {
        const apiKey = await storage.get("asrApiKey")
        return !!apiKey
    }

    async transcribe(audioBlob: Blob): Promise<string> {
        const apiKey = await storage.get("asrApiKey")
        const apiUrl = await storage.get("asrApiUrl") || "https://api.openai.com/v1"
        const model = await storage.get("asrModel") || "whisper-1"
        const provider = await storage.get("asrProvider") || "OpenAI"

        if (!apiKey) {
            throw new Error("ASR API Key is missing. Please configure it in settings.")
        }

        console.log(`[ASRService] Using provider: ${provider}, model: ${model}, url: ${apiUrl}`)

        // Standard OpenAI-compatible format (OpenAI, Groq)
        if (provider === "OpenAI" || provider === "Groq") {
            const formData = new FormData()
            formData.append("file", audioBlob, "audio.webm")
            formData.append("model", model)
            formData.append("response_format", "text")

            const endpoint = `${apiUrl.replace(/\/$/, "")}/audio/transcriptions`
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                body: formData
            })

            if (!response.ok) {
                const errorData = await response.text()
                console.error("[ASRService] API Error:", errorData)
                throw new Error(`ASR API failed: ${response.statusText}`)
            }

            return await response.text()
        } 
        
        // Fallback or generic handling for other providers
        // For now, many 'compatible' endpoints use the same structure
        throw new Error(`Provider ${provider} is currently in development for customized handling. Only OpenAI/Groq are fully tested with standard Whisper format.`)
    }
}
