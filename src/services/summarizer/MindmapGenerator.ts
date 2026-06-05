import { AIServiceFactory } from "../ai/AIServiceFactory"
import { Prompts } from "../ai/prompts"
import { chunkText } from "../../utils/textChunker"
import type { IAIService } from "../ai/types"

/**
 * Generate mind-map markdown from a transcript/script. Extracted from
 * useMindMap so both the hook and the export pipeline share one implementation.
 * `service` is injectable for testing; defaults to the configured AI service.
 */
export async function generateMindmapMarkdown(
  script: string,
  language: string,
  service?: IAIService
): Promise<string> {
  const aiService = service ?? (await AIServiceFactory.getService())
  const chunks = chunkText(script, 3000)
  let combinedText = script
  if (chunks.length > 1) {
    const summaries = await Promise.all(
      chunks.map(chunk =>
        aiService.chat([{ role: "user", content: Prompts.mindmapChunkSummary(chunk, language) }])
      )
    )
    combinedText = summaries.join("\n\n")
  }
  const result = await aiService.chat([{ role: "user", content: Prompts.mindmap(combinedText, language) }])
  return result.replace(/^```(?:markdown)?\n?/m, "").replace(/\n?```$/m, "").trim()
}
