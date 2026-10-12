import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

/**
 * OpenAI-compatible chat service. Used by OpenAI, Grok, Qwen, Z.AI, MiniMax
 * and DeepSeek. Each provider exposes reasoning/thinking control through a
 * different field, so we map the shared `thinking` toggle per provider and
 * gracefully retry without it if the model rejects the field.
 */
export class OpenAIService extends BaseAIService {
    private baseUrl: string
    private provider: string

    constructor(
        apiKey: string,
        modelName: string = "gpt-4o-mini",
        baseUrl: string = "https://api.openai.com/v1",
        provider: string = "OpenAI",
        thinking: boolean = false
    ) {
        super(apiKey, modelName, thinking)
        this.baseUrl = baseUrl.replace(/\/+$/, "")
        this.provider = provider
    }

    /** Provider-specific field(s) that switch reasoning/thinking mode. */
    private thinkingFields(): Record<string, any> {
        switch (this.provider) {
            case "OpenAI":
            case "Grok":
                // Supported reasoning models accept "none" to skip reasoning.
                return { reasoning_effort: this.thinking ? "medium" : "none" }
            case "DeepSeek":
            case "Z.AI":
                return { thinking: { type: this.thinking ? "enabled" : "disabled" } }
            case "Qwen":
                // DashScope OpenAI-compatible endpoint.
                return { enable_thinking: this.thinking }
            default:
                // MiniMax (and unknown providers) have no reliable public switch.
                return {}
        }
    }

    private buildBody(messages: ChatMessage[], context: string | undefined, includeThinking: boolean) {
        const msgs = [...messages]
        if (context) {
            msgs.unshift({ role: "system", content: `Context: ${context}` })
        }
        return {
            model: this.modelName,
            messages: msgs,
            ...(includeThinking ? this.thinkingFields() : {})
        }
    }

    private async post(body: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        })
        return await response.json()
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const hasThinkingField = Object.keys(this.thinkingFields()).length > 0
        let data = await this.post(this.buildBody(messages, context, hasThinkingField))

        // Non-reasoning models reject the thinking/reasoning field. If that is
        // the specific failure, retry once without it so the request still works.
        if (data?.error && hasThinkingField) {
            const msg = String(data.error?.message || data.error || "")
            if (/reasoning_effort|thinking|enable_thinking|unsupported|unrecognized|unknown|invalid/i.test(msg)) {
                data = await this.post(this.buildBody(messages, context, false))
            }
        }

        if (data.error) {
            throw new Error(`OpenAI API Error: ${data.error.message || data.error}`)
        }

        return data.choices?.[0]?.message?.content || ""
    }
}
