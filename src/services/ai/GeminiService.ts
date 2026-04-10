import { BaseAIService } from "./BaseAIService"
import type { ChatMessage } from "./types"

export class GeminiService extends BaseAIService {
    constructor(apiKey: string) {
        super(apiKey, "Gemini")
    }

    async chat(messages: ChatMessage[], context?: string): Promise<string> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${this.apiKey}`

        // Convert ChatMessage to Gemini format
        const contents = messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }))

        if (context) {
            contents.unshift({
                role: "user",
                parts: [{ text: `Context: ${context}` }]
            })
        }

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents })
        })

        const data = await response.json()

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message}`)
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    }
}
