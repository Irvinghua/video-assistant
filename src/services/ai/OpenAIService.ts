import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class OpenAIService extends BaseAIService {
    private baseUrl: string

    constructor(apiKey: string, modelName: string = "gpt-4o-mini", baseUrl: string = "https://api.openai.com/v1") {
        super(apiKey, modelName)
        this.baseUrl = baseUrl.replace(/\/+$/, "")
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const msgs = [...messages]
        if (context) {
            msgs.unshift({ role: "system", content: `Context: ${context}` })
        }

        const url = `${this.baseUrl}/chat/completions`

        // Route through the background service worker (FETCH_AI). A direct fetch
        // from a content script is blocked for endpoints whose CORS headers don't
        // match the extension origin (e.g. Qwen token-plan), which surfaces as a
        // bare "Failed to fetch". The worker has host_permissions and bypasses that.
        const resp = await chrome.runtime.sendMessage({
            type: "FETCH_AI",
            url,
            method: "POST",
            headers: { "Authorization": `Bearer ${this.apiKey}` },
            body: JSON.stringify({ model: this.modelName, messages: msgs })
        })

        if (!resp?.success) {
            const detail = resp?.status ? `HTTP ${resp.status}` : (resp?.error || "network error")
            console.error("[OpenAIService] request failed", { url, status: resp?.status, error: resp?.error })
            throw new Error(`AI request failed: ${detail}`)
        }

        const data = resp.data
        if (typeof data === "string") {
            throw new Error(`AI request failed: non-JSON response (HTTP ${resp.status})`)
        }
        if (data?.error) {
            const msg = typeof data.error === "string" ? data.error : data.error.message
            throw new Error(`OpenAI API Error: ${msg}`)
        }

        return data?.choices?.[0]?.message?.content || ""
    }
}
