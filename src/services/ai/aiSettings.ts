import { Storage } from "@plasmohq/storage"
import type { SummaryDepth } from "./types"

/** Default when the user has never touched the setting. */
export const DEFAULT_SUMMARY_DEPTH: SummaryDepth = "deep"
export const DEFAULT_CHAT_THINKING = false

/**
 * Read the user's summary output mode.
 * `deep` (default) keeps the detailed fullDigest; `concise` asks for ~500 chars.
 */
export async function getSummaryDepth(): Promise<SummaryDepth> {
    const storage = new Storage()
    const value = await storage.get("summaryDepth")
    return value === "concise" ? "concise" : DEFAULT_SUMMARY_DEPTH
}

/**
 * Whether the model should be allowed to spend tokens on reasoning/thinking.
 * Defaults to false (faster, lower quality) — see the options hint.
 */
export async function getChatThinking(): Promise<boolean> {
    const storage = new Storage()
    const value = (await storage.get("chatThinking")) as unknown as boolean
    return value === true
}
