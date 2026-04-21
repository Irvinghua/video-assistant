import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class OllamaService extends BaseAIService {
    private endpointUrl: string

    constructor(apiKey: string, modelName: string = "glm-5.1", endpointUrl: string = "https://ollama.com/api/chat") {
        super(apiKey, modelName)
        this.endpointUrl = endpointUrl
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const msgs = [...messages]
        if (context) {
            msgs.unshift({ role: "system", content: `Context: ${context}` })
        }

        const body = JSON.stringify({
            model: this.modelName,
            messages: msgs,
            stream: false
        })

        // Ollama Cloud does not send CORS headers, so a direct fetch from a
        // content script (bilibili.com / youtube.com origin) is blocked by the
        // browser. Route through the background service worker, which has
        // host_permissions and is not subject to page-origin CORS.
        const resp = await chrome.runtime.sendMessage({
            type: "FETCH_API",
            url: this.endpointUrl,
            options: {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body
            }
        })

        if (!resp?.success) {
            throw new Error(`Ollama API Error: ${resp?.error || "request failed"}`)
        }

        const data = resp.data
        if (data && typeof data === "object" && (data as any).error) {
            const err = (data as any).error
            const msg = typeof err === "string" ? err : err.message
            throw new Error(`Ollama API Error: ${msg}`)
        }

        return (data as any)?.message?.content || ""
    }
}
