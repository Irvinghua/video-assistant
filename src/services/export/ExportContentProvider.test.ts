import { describe, it, expect, vi } from "vitest"
import { ensureSections, type EnsureDeps } from "./ExportContentProvider"
import type { SummaryResult, CommentAnalysis } from "../ai/types"

const summary: SummaryResult = { oneLiner: "x", chapters: [], fullDigest: "y" }
const comments: CommentAnalysis = { consensus: [], divergences: [], gap: { hit: "", miss: "" }, mood: [], spotlight: [] }

function makeDeps(over: Partial<EnsureDeps> = {}): EnsureDeps {
  return {
    getCached: vi.fn(async () => null),
    setCached: vi.fn(async () => {}),
    getScript: vi.fn(async () => "script text"),
    genSummary: vi.fn(async () => summary),
    genComments: vi.fn(async () => comments),
    genMindmap: vi.fn(async () => "# mm"),
    ...over
  }
}

const inputs = {
  platform: "bilibili",
  videoId: "BV1",
  language: "Chinese",
  subtitles: [{ text: "a", start: 0, end: 1 }],
  sampledComments: { consensus: [{ text: "c", likes: 9 } as any], controversial: [] }
}

it("uses cached section without regenerating", async () => {
  const deps = makeDeps({ getCached: vi.fn(async () => summary) as EnsureDeps["getCached"] })
  const r = await ensureSections(new Set(["summary"]), inputs, deps)
  expect(r.summary).toBe(summary)
  expect(deps.genSummary).not.toHaveBeenCalled()
  expect(r.missing).toEqual([])
})

it("generates and caches a missing section when prerequisites are available", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["summary", "mindmap"]), inputs, deps)
  expect(deps.genSummary).toHaveBeenCalledOnce()
  expect(deps.genMindmap).toHaveBeenCalledOnce()
  expect(deps.setCached).toHaveBeenCalledTimes(2)
  expect(r.summary).toBe(summary)
  expect(r.mindmap).toBe("# mm")
})

it("marks summary missing (no silent ASR) when there are no subtitles", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["summary"]), { ...inputs, subtitles: [] }, deps)
  expect(deps.genSummary).not.toHaveBeenCalled()
  expect(r.summary).toBeNull()
  expect(r.missing).toEqual(["summary"])
})

it("marks comments missing when there are no sampled comments", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["comments"]), { ...inputs, sampledComments: { consensus: [], controversial: [] } }, deps)
  expect(deps.genComments).not.toHaveBeenCalled()
  expect(r.missing).toEqual(["comments"])
})

it("propagates generator errors to the caller (no swallow)", async () => {
  const deps = makeDeps({ genSummary: vi.fn(async () => { throw new Error("AI not configured") }) })
  await expect(ensureSections(new Set(["summary"]), inputs, deps)).rejects.toThrow("AI not configured")
})
