import type { IAIService, SummaryResult, CommentAnalysis, ChatMessage, SummarizeOptions } from "./types"
import { Prompts } from "./prompts"

export abstract class BaseAIService implements IAIService {
    protected apiKey: string
    protected modelName: string

    constructor(apiKey: string, modelName: string) {
        this.apiKey = apiKey
        this.modelName = modelName
    }

    getModelName(): string {
        return this.modelName
    }

    abstract chat(messages: ChatMessage[], context?: string): Promise<string>

    async summarize(text: string, opts?: SummarizeOptions): Promise<SummaryResult> {
        const response = await this.chat([{ role: "user", content: Prompts.finalSummary(text) }])
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            return JSON.parse(jsonMatch ? jsonMatch[0] : response)
        } catch (e) {
            console.error("Failed to parse summary JSON", e)
            throw new Error("AI response format error")
        }
    }

    async analyzeComments(comments: string[], opts?: any): Promise<CommentAnalysis> {
        const response = await this.chat([{ role: "user", content: Prompts.analyzeComments(comments.join("\n")) }])
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/)
            return JSON.parse(jsonMatch ? jsonMatch[0] : response)
        } catch (e) {
            console.error("Failed to parse comments JSON", e)
            throw new Error("AI response format error")
        }
    }
}
