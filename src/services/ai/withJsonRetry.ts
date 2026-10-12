import type { IAIService } from "./types"
import { checkJson } from "../../utils/aiJsonValidator"

/** Hard cap on JSON-producing AI calls per request. */
export const MAX_JSON_ATTEMPTS = 3

/** How much of the previous (invalid) response we echo back when retrying. */
const MAX_PREVIOUS_CHARS = 8000

/** Thrown when the model still fails to produce valid JSON after all attempts. */
export class AIJsonFormatError extends Error {
    readonly code = "AI_JSON_FORMAT"
    readonly attempts: number
    readonly lastError: string

    constructor(attempts: number, lastError: string) {
        super(`AI returned invalid JSON after ${attempts} attempts: ${lastError}`)
        this.name = "AIJsonFormatError"
        this.attempts = attempts
        this.lastError = lastError
    }
}

/** True when `err` is the "model failed all JSON attempts" error. */
export function isAIJsonFormatError(err: unknown): boolean {
    return (err as any)?.code === "AI_JSON_FORMAT"
}

export interface JsonRetryOptions {
    /** First-attempt prompt (the normal task prompt). */
    prompt: string
    /** Required JSON shape, echoed back to the model on retries. */
    schemaHint: string
    /** Optional structural check beyond parseability; return an error string to reject. */
    validate?: (value: any) => string | null
}

/**
 * Prompt sent on attempt 2/3: the model gets its own previous output plus the
 * local parse error, and is asked to return corrected JSON only. We do NOT
 * resend the original transcript — the model already saw it and produced this
 * output, so the correction only needs the output + error + schema.
 */
function buildRepairPrompt(previous: string, error: string, schemaHint: string): string {
    const excerpt = previous.length > MAX_PREVIOUS_CHARS
        ? previous.slice(0, MAX_PREVIOUS_CHARS) + "\n…(truncated)"
        : previous

    return `Your previous response was rejected: it is not valid JSON.

[JSON parse error]
${error}

[Your previous response]
${excerpt}

Return the corrected result now.
Requirements:
- Output ONLY one valid JSON object — no markdown fences, no prose before or after.
- The JSON must conform exactly to this schema:
${schemaHint}
- Follow RFC 8259 strictly: every string must be properly escaped.`
}

/**
 * Run a JSON-producing AI call with a validate-and-retry loop:
 *   attempt 1 → normal prompt
 *   attempt 2/3 → send the previous output + parse error back for correction
 * If it still fails after MAX_JSON_ATTEMPTS, throw AIJsonFormatError so the UI
 * can tell the user the model is not capable enough for this task.
 */
export async function withJsonRetry(aiService: IAIService, opts: JsonRetryOptions): Promise<any> {
    let previous = ""
    let lastError = ""

    for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
        const prompt = attempt === 1
            ? opts.prompt
            : buildRepairPrompt(previous, lastError, opts.schemaHint)

        const raw = await aiService.chat([{ role: "user", content: prompt }])
        const result = checkJson(raw)

        if (result.ok) {
            const structuralError = opts.validate ? opts.validate(result.value) : null
            if (!structuralError) return result.value
            lastError = `JSON parsed but the structure was invalid: ${structuralError}`
        } else {
            lastError = result.error || "Unknown JSON parse error"
        }

        previous = raw
        console.warn(`[withJsonRetry] Attempt ${attempt}/${MAX_JSON_ATTEMPTS} failed: ${lastError}`)
    }

    throw new AIJsonFormatError(MAX_JSON_ATTEMPTS, lastError)
}