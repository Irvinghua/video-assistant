import type { IAIService, SummaryResult, CommentAnalysis, ChatMessage, SummarizeOptions } from "./types"
import { Prompts } from "./prompts"

/** Strip markdown code fences and extract the first valid JSON object from AI response. */
function extractJSON(response: string): string | null {
    let cleaned = response.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim()

    const firstBrace = cleaned.indexOf("{")
    if (firstBrace === -1) return null

    let depth = 0
    let inString = false
    let escape = false
    for (let i = firstBrace; i < cleaned.length; i++) {
        const ch = cleaned[i]
        if (escape) { escape = false; continue }
        if (ch === "\\") { if (inString) escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === "{") depth++
        if (ch === "}") depth--
        if (depth === 0) return cleaned.substring(firstBrace, i + 1)
    }
    const match = cleaned.match(/\{[\s\S]*\}/)
    return match ? match[0] : null
}

/** Try JSON.parse with fallback fixes for common AI output issues. */
function parseJSONSafe(raw: string): any {
    try { return JSON.parse(raw) } catch { /* continue */ }
    // Remove trailing commas before } or ]
    const noTrailingCommas = raw.replace(/,\s*([}\]])/g, "$1")
    try { return JSON.parse(noTrailingCommas) } catch { /* continue */ }
    // Fix single-quoted strings
    const noSingleQuotes = noTrailingCommas.replace(/'([^']*)'/g, '"$1"')
    try { return JSON.parse(noSingleQuotes) } catch { /* continue */ }
    throw new Error("Unable to parse AI response as JSON")
}

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
        const response = await this.chat([{ role: "user", content: Prompts.finalSummary(text, opts?.language) }])
        const jsonStr = extractJSON(response)
        if (!jsonStr) {
            console.error("[BaseAIService] No JSON found in summarize response:", response.slice(0, 500))
            throw new Error("AI response did not contain valid JSON")
        }
        try {
            return parseJSONSafe(jsonStr)
        } catch (e) {
            console.error("[BaseAIService] Failed to parse summary JSON:", e, "Raw (first 500):", response.slice(0, 500))
            throw new Error("AI response format error")
        }
    }

    async analyzeComments(videoScript: string, samplesJson: string, language?: string): Promise<CommentAnalysis> {
        const response = await this.chat([{ role: "user", content: Prompts.analyzeComments(videoScript, samplesJson, language) }])
        const jsonStr = extractJSON(response)
        if (!jsonStr) {
            console.error("[BaseAIService] No JSON found in analyzeComments response:", response.slice(0, 500))
            throw new Error("AI response did not contain valid JSON")
        }
        try {
            return parseJSONSafe(jsonStr)
        } catch (e) {
            console.error("[BaseAIService] Failed to parse comments JSON:", e, "Raw (first 500):", response.slice(0, 500))
            throw new Error("AI response format error")
        }
    }
}
