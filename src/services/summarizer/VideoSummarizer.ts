import { AIServiceFactory } from "../ai/AIServiceFactory"
import { Prompts } from "../ai/prompts"
import { chunkText } from "../../utils/textChunker"
import type { SummaryResult } from "../ai/types"
import type { SubtitleSegment } from "../platform/types"

/** Strip markdown code fences and extract the first valid JSON object from AI response. */
function extractJSON(response: string): string | null {
    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    let cleaned = response.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim()

    // Try to find balanced curly-brace JSON using a stack-based approach
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
    // Unbalanced — fall back to greedy regex
    const match = cleaned.match(/\{[\s\S]*\}/)
    return match ? match[0] : null
}

/** Try JSON.parse with fallback fixes for common AI output issues. */
function parseJSONSafe(raw: string): any {
    // Attempt 1: direct parse
    try { return JSON.parse(raw) } catch { /* continue */ }

    // Attempt 2: remove trailing commas before } or ]
    const noTrailingCommas = raw.replace(/,\s*([}\]])/g, "$1")
    try { return JSON.parse(noTrailingCommas) } catch { /* continue */ }

    // Attempt 3: fix single-quoted strings (rare but happens)
    const noSingleQuotes = noTrailingCommas.replace(/'([^']*)'/g, '"$1"')
    try { return JSON.parse(noSingleQuotes) } catch { /* continue */ }

    throw new Error("Unable to parse AI response as JSON")
}

export class VideoSummarizer {
    async summarize(subtitles: SubtitleSegment[], language: string = "Chinese"): Promise<SummaryResult> {
        const aiService = await AIServiceFactory.getService()

        const textWithTime = subtitles.map(s => {
            const m = Math.floor(s.start / 60)
            const sec = Math.floor(s.start % 60)
            return `[${m}:${sec.toString().padStart(2, '0')}] ${s.text}`
        }).join("\n")

        const chunks = chunkText(textWithTime, 3000)

        // Single chunk: the timestamped transcript is short enough to feed the
        // final pass directly. The intermediate per-chunk summary would only add
        // a redundant full AI round-trip (the dominant cost), so skip it.
        let combinedSummary: string
        if (chunks.length === 1) {
            combinedSummary = chunks[0]
        } else {
            const chunkSummaries = await Promise.all(
                chunks.map((chunk, index) =>
                    aiService.chat([{ role: "user", content: Prompts.chunkSummary(chunk, index, language) }])
                )
            )
            combinedSummary = chunkSummaries.join("\n\n---\n\n")
        }

        const response = await aiService.chat([
            { role: "user", content: Prompts.finalSummary(combinedSummary, language) }
        ])

        const jsonStr = extractJSON(response)
        if (!jsonStr) {
            console.error("[VideoSummarizer] No JSON found in AI response:", response.slice(0, 500))
            throw new Error("AI response did not contain valid JSON. Please try again.")
        }

        try {
            const parsed = parseJSONSafe(jsonStr)
            if (!parsed.chapters || !Array.isArray(parsed.chapters)) parsed.chapters = []
            return parsed
        } catch (e) {
            console.error("[VideoSummarizer] JSON Parse Error:", e, "Raw response (first 500 chars):", response.slice(0, 500))
            throw new Error("Failed to parse summary JSON. The AI response was malformed — please try again.")
        }
    }
}
