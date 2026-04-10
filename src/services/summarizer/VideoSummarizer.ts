import { AIServiceFactory } from "../ai/AIServiceFactory"
import { Prompts } from "../ai/prompts"
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
        console.log(`[VideoSummarizer] Summarizing ${chunks.length} chunks...`)

        const chunkSummaries = await Promise.all(
            chunks.map((chunk, index) =>
                aiService.chat([{ role: "user", content: Prompts.chunkSummary(chunk, index, language) }])
            )
        )

        const combinedSummary = chunkSummaries.join("\n\n---\n\n")
        const response = await aiService.chat([
            { role: "user", content: Prompts.finalSummary(combinedSummary, language) }
        ])

        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("Failed to generate JSON summary. AI response was not valid JSON.")

        try {
            const parsed = JSON.parse(jsonMatch[0])
            if (!parsed.chapters || !Array.isArray(parsed.chapters)) parsed.chapters = []
            return parsed
        } catch (e) {
            console.error("[VideoSummarizer] JSON Parse Error:", e, response)
            throw new Error("Failed to parse summary JSON")
        }
    }
}
