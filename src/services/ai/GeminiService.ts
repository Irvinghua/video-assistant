import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class GeminiService extends BaseAIService {
    private baseUrl: string

    constructor(
        apiKey: string,
        modelName: string = "gemini-1.5-pro",
        baseUrl: string = "https://generativelanguage.googleapis.com/v1beta",
        thinking: boolean = false
    ) {
        super(apiKey, modelName, thinking)
        this.baseUrl = baseUrl.replace(/\/+$/, "")
    }

    private buildBody(contents: any[], includeThinking: boolean) {
        return {
            contents,
            ...(includeThinking
                ? { generationConfig: { thinkingConfig: { thinkingLevel: this.thinking ? "high" : "minimal" } } }
                : {})
        }
    }

    private async post(contents: any[], includeThinking: boolean): Promise<any> {
        const url = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.buildBody(contents, includeThinking))
        })
        return await response.json()
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const contents = messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }))

        if (context) {
            contents.unshift({
                role: "user",
                parts: [{ text: `Context: ${context}` }]
            })
        }

        let data = await this.post(contents, true)

        // Models/versions that do not support thinkingConfig reject the field.
        if (data?.error) {
            const msg = String(data.error?.message || data.error || "")
            if (/thinking|unsupported|unknown|invalid/i.test(msg)) {
                data = await this.post(contents, false)
            }
        }

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message || data.error}`)
        }

        // Skip thought parts when thinking is enabled.
        const parts: any[] = data.candidates?.[0]?.content?.parts || []
        return parts
            .filter((p) => p && !p.thought && typeof p.text === "string")
            .map((p) => p.text)
            .join("") || ""
    }
}
