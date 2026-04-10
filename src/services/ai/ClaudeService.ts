import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class ClaudeService extends BaseAIService {
    constructor(apiKey: string) {
        super(apiKey, "Claude")
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const url = "https://api.anthropic.com/v1/messages"

        // Claude messages format: system prompt is separate
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
                "anthropic-dangerous-direct-browser-access": "true" // Required for browser calls
            },
            body: JSON.stringify({
                model: "claude-3-opus-20240229",
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
