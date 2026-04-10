import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class OpenAIService extends BaseAIService {
    private baseUrl: string

    constructor(apiKey: string, modelName: string = "gpt-3.5-turbo", baseUrl: string = "https://api.openai.com/v1") {
        super(apiKey, modelName)
        this.baseUrl = baseUrl
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const msgs = [...messages]
        if (context) {
            msgs.unshift({ role: "system", content: `Context: ${context}` })
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.modelName === "ChatGPT" ? "gpt-3.5-turbo" : this.modelName, // simple mapping
                messages: msgs
            })
        })

        const data = await response.json()

        if (data.error) {
            throw new Error(`OpenAI API Error: ${data.error.message}`)
        }

        return data.choices?.[0]?.message?.content || ""
    }
}
