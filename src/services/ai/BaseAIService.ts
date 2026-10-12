import type { IAIService, SummaryResult, CommentAnalysis, ChatMessage, SummarizeOptions } from "./types"
import { Prompts, buildSummaryJsonSchema, COMMENTS_JSON_SCHEMA } from "./prompts"
import { withJsonRetry } from "./withJsonRetry"
import { getSummaryDepth } from "./aiSettings"

export abstract class BaseAIService implements IAIService {
    protected apiKey: string
    protected modelName: string
    /** Whether the model may spend tokens on reasoning/thinking. */
    protected thinking: boolean

    constructor(apiKey: string, modelName: string, thinking: boolean = false) {
        this.apiKey = apiKey
        this.modelName = modelName
        this.thinking = thinking
    }

    getModelName(): string {
        return this.modelName
    }

    abstract chat(messages: ChatMessage[], context?: string): Promise<string>

    async summarize(text: string, opts?: SummarizeOptions): Promise<SummaryResult> {
        const depth = await getSummaryDepth()
        return await withJsonRetry(this, {
            prompt: Prompts.finalSummary(text, opts?.language, depth),
            schemaHint: buildSummaryJsonSchema(depth),
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
