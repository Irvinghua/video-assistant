/**
 * Local JSON format check for AI responses.
 *
 * This is intentionally a *strict* check with no malformation-specific repair
 * logic (no quote-fixing, no comma-fixing, …): malformed-output patterns are
 * open-ended, so guessing them in code is a losing game. Instead callers use
 * `checkJson` as a gate and, when it fails, send the raw response + the parse
 * error back to the model for correction (see services/ai/withJsonRetry.ts).
 */

export interface JsonCheckResult {
    ok: boolean
    /** Present when ok === true */
    value?: any
    /** Present when ok === false */
    error?: string
}

/**
 * Strip an optional markdown code fence and take the first `{` … last `}` span.
 * This is extraction only (tolerating prose/fences around the object), not
 * repair of the JSON itself.
 */
export function extractJsonCandidate(text: string): string | null {
    if (typeof text !== "string") return null
    const cleaned = text
        .replace(/```(?:json)?/gi, "")
        .trim()
    const first = cleaned.indexOf("{")
    if (first === -1) return null
    const last = cleaned.lastIndexOf("}")
    if (last <= first) return null
    return cleaned.substring(first, last + 1)
}

/** Strict JSON parse gate: `JSON.parse` on the extracted candidate. */
export function checkJson(text: string): JsonCheckResult {
    if (typeof text !== "string" || !text.trim()) {
        return { ok: false, error: "Empty AI response" }
    }
    const candidate = extractJsonCandidate(text)
    if (!candidate) {
        return { ok: false, error: "No JSON object found in the AI response" }
    }
    try {
        return { ok: true, value: JSON.parse(candidate) }
    } catch (e) {
        return { ok: false, error: (e as Error).message }
    }
}