import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class ClaudeService extends BaseAIService {
    private baseUrl: string

    constructor(
        apiKey: string,
        modelName: string = "claude-opus-4-7",
        baseUrl: string = "https://api.anthropic.com/v1",
        thinking: boolean = false
    ) {
        super(apiKey, modelName, thinking)
        this.baseUrl = baseUrl.replace(/\/+$/, "")
    }

    private buildBody(systemPrompt: string, messages: ChatMessage[], includeThinking: boolean) {
        const body: Record<string, any> = {
            model: this.modelName,
            // Extended thinking requires `max_tokens` to exceed the thinking budget.
            max_tokens: includeThinking && this.thinking ? 8192 : 1024,
            system: systemPrompt,
            messages
        }
        if (includeThinking) {
            body.thinking = this.thinking
                ? { type: "enabled", budget_tokens: 4096 }
                : { type: "disabled" }
        }
        return body
    }

    private async post(body: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: "POST",
            headers: {
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify(body)
        })
        return await response.json()
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        let systemPrompt = ""
        if (context) {
            systemPrompt = `Context: ${context}`
        }

        const anthropicMessages = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content }))

        let data = await this.post(this.buildBody(systemPrompt, anthropicMessages, true))

        // Some account/API versions reject the `thinking` field — retry without it.
        if (data?.error) {
            const msg = String(data.error?.message || data.error || "")
            if (/thinking|beta|unsupported|unrecognized|invalid/i.test(msg)) {
                data = await this.post(this.buildBody(systemPrompt, anthropicMessages, false))
            }
        }

        if (data.error) {
            throw new Error(`Claude API Error: ${data.error.message || data.error}`)
        }

        // With thinking enabled the response may start with a thinking block;
        // return the first text block instead of blindly taking content[0].
        const blocks: any[] = Array.isArray(data.content) ? data.content : []
        const textBlock = blocks.find((b) => b?.type === "text" && typeof b.text === "string")
        return textBlock?.text || blocks[0]?.text || ""
    }
}
