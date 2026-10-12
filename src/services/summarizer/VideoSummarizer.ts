import { AIServiceFactory } from "../ai/AIServiceFactory"
import { Prompts, SUMMARY_JSON_SCHEMA } from "../ai/prompts"
import { withJsonRetry } from "../ai/withJsonRetry"
import { chunkText } from "../../utils/textChunker"
import type { SummaryResult } from "../ai/types"
import type { SubtitleSegment } from "../platform/types"

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

        const parsed = await withJsonRetry(aiService, {
            prompt: Prompts.finalSummary(combinedSummary, language),
            schemaHint: SUMMARY_JSON_SCHEMA,
            validate: (value) =>
                value && Array.isArray(value.chapters) ? null : "`chapters` must be an array"
        })
        if (!Array.isArray(parsed.chapters)) parsed.chapters = []
        return parsed
    }
}
