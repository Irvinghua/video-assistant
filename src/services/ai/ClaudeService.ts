import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class ClaudeService extends BaseAIService {
    private baseUrl: string

    constructor(apiKey: string, modelName: string = "claude-opus-4-7", baseUrl: string = "https://api.anthropic.com/v1") {
        super(apiKey, modelName)
        this.baseUrl = baseUrl.replace(/\/+$/, "")
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const url = `${this.baseUrl}/messages`

        let systemPrompt = ""
        if (context) {
            systemPrompt = `Context: ${context}`
        }

        const anthropicMessages = messages.filter(m => m.role !== "system").map(m => ({
            role: m.role,
            content: m.content
        }))

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: this.modelName,
                max_tokens: 1024,
                system: systemPrompt,
                messages: anthropicMessages
            })
        })

        const data = await response.json()

        if (data.error) {
            throw new Error(`Claude API Error: ${data.error.message}`)
        }

        return data.content?.[0]?.text || ""
    }
}
