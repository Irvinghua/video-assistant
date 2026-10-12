import type { IAIService, SummaryResult, CommentAnalysis, ChatMessage, SummarizeOptions } from "./types"
import { Prompts, SUMMARY_JSON_SCHEMA, COMMENTS_JSON_SCHEMA } from "./prompts"
import { withJsonRetry } from "./withJsonRetry"

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
        return await withJsonRetry(this, {
            prompt: Prompts.finalSummary(text, opts?.language),
            schemaHint: SUMMARY_JSON_SCHEMA,
            validate: (value) =>
                value && Array.isArray(value.chapters) ? null : "`chapters` must be an array"
        })
    }

    async analyzeComments(videoScript: string, samplesJson: string, language?: string): Promise<CommentAnalysis> {
        return await withJsonRetry(this, {
            prompt: Prompts.analyzeComments(videoScript, samplesJson, language),
            schemaHint: COMMENTS_JSON_SCHEMA,
            validate: (value) =>
                value && typeof value === "object" ? null : "response must be a JSON object"
        })
    }
}
