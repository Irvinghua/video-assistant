import { describe, it, expect, vi } from "vitest"
import {
    withJsonRetry,
    isAIJsonFormatError,
    AIJsonFormatError,
    MAX_JSON_ATTEMPTS
} from "./withJsonRetry"
import { checkJson } from "../../utils/aiJsonValidator"
import type { IAIService } from "./types"

/**
 * Real failure captured from Ollama Cloud / glm-5.3-flash: unescaped raw ASCII
 * double quotes inside a CJK string value terminate the JSON string early, so
 * JSON.parse fails. The whole point of the fix is that we do NOT try to repair
 * this (or any other malformed shape) in code — we send it back to the model.
 */
const GLM_BROKEN_SUMMARY =
    '{"oneLiner": "演讲者指出，日本"失去的三十年"的根源是美国霸权打压", "chapters": [{"timestamp": 0, "title": "开场", "summary": "引入话题"}], "fullDigest": "详细内容"}'

const VALID_SUMMARY = JSON.stringify({
    oneLiner: "一句话总结",
    chapters: [{ timestamp: 0, title: "开场", summary: "引入话题" }],
    fullDigest: "详细内容"
})

const SCHEMA = `{ "oneLiner": string, "chapters": [...], "fullDigest": string }`
const validateSummary = (v: any) => (v && Array.isArray(v.chapters) ? null : "`chapters` must be an array")

function fakeService(responses: string[]) {
    let i = 0
    const chat = vi.fn(async (_messages: any) => responses[Math.min(i++, responses.length - 1)])
    const svc = {
        chat,
        summarize: vi.fn(),
        analyzeComments: vi.fn(),
        getModelName: () => "fake"
    } as unknown as IAIService
    return { svc, chat }
}

describe("checkJson", () => {
    it("rejects the real glm unescaped-quote output", () => {
        const result = checkJson(GLM_BROKEN_SUMMARY)
        expect(result.ok).toBe(false)
    })

    it("accepts valid JSON wrapped in a markdown fence + prose", () => {
        const result = checkJson("Here you go:\n```json\n" + VALID_SUMMARY + "\n```\n")
        expect(result.ok).toBe(true)
    })
})

describe("withJsonRetry", () => {
    it("succeeds on the first attempt without retrying", async () => {
        const { svc, chat } = fakeService([VALID_SUMMARY])
        const result = await withJsonRetry(svc, {
            prompt: "make a summary",
            schemaHint: SCHEMA,
            validate: validateSummary
        })
        expect(result).toEqual(JSON.parse(VALID_SUMMARY))
        expect(chat).toHaveBeenCalledTimes(1)
    })

    it("sends the broken output back and succeeds on retry", async () => {
        const { svc, chat } = fakeService([GLM_BROKEN_SUMMARY, VALID_SUMMARY])
        const result = await withJsonRetry(svc, {
            prompt: "make a summary",
            schemaHint: SCHEMA,
            validate: validateSummary
        })
        expect(result).toEqual(JSON.parse(VALID_SUMMARY))
        expect(chat).toHaveBeenCalledTimes(2)

        // The retry prompt must contain the previous output and the parse error.
        const retryPrompt = (chat.mock.calls[1][0] as any)[0].content as string
        expect(retryPrompt).toContain("失去的三十年")
        expect(retryPrompt.toLowerCase()).toContain("json")
    })

    it("throws AIJsonFormatError after exactly MAX_JSON_ATTEMPTS failures", async () => {
        const { svc, chat } = fakeService([GLM_BROKEN_SUMMARY])
        const err = await withJsonRetry(svc, {
            prompt: "make a summary",
            schemaHint: SCHEMA,
            validate: validateSummary
        }).catch(e => e)

        expect(err).toBeInstanceOf(AIJsonFormatError)
        expect(isAIJsonFormatError(err)).toBe(true)
        expect(chat).toHaveBeenCalledTimes(MAX_JSON_ATTEMPTS)
        expect((err as AIJsonFormatError).attempts).toBe(MAX_JSON_ATTEMPTS)
    })

    it("retries when the JSON parses but fails structural validation", async () => {
        const { svc, chat } = fakeService(['{"oneLiner": "x"}', VALID_SUMMARY])
        const result = await withJsonRetry(svc, {
            prompt: "make a summary",
            schemaHint: SCHEMA,
            validate: validateSummary
        })
        expect(result.chapters).toHaveLength(1)
        expect(chat).toHaveBeenCalledTimes(2)
    })

    it("also covers comment analysis shape (plain object validation)", async () => {
        const valid = JSON.stringify({ consensus: [], divergences: [], gap: { hit: "", miss: "" }, mood: [], spotlight: [] })
        const { svc, chat } = fakeService(["not json at all", valid])
        const result = await withJsonRetry(svc, {
            prompt: "analyze comments",
            schemaHint: "{ consensus: [], ... }",
            validate: (v: any) => (v && typeof v === "object" ? null : "must be an object")
        })
        expect(result).toEqual(JSON.parse(valid))
        expect(chat).toHaveBeenCalledTimes(2)
    })
})
