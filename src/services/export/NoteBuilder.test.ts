import { it, expect } from "vitest"
import { buildNoteDocument } from "./NoteBuilder"
import type { SummaryResult, CommentAnalysis } from "../ai/types"

const summary: SummaryResult = {
  oneLiner: "一句话",
  chapters: [{ timestamp: 90, title: "开场", summary: "讲了开场" }],
  fullDigest: "精简稿正文"
}

const labels = {
  summarySection: "视频总结",
  commentsSection: "舆情报告",
  mindmapSection: "思维导图",
  oneLiner: "一句话简介",
  keyPoints: "分段要点",
  fullDigest: "全文精简稿",
  consensus: "核心共识",
  divergences: "主要分歧",
  gap: "视频 vs 观众",
  gapHit: "命中区",
  gapMiss: "盲区/溢出",
  mood: "舆情氛围",
  spotlight: "独立见解",
  source: "来源",
  author: "作者",
  exportedAt: "导出时间"
}

it("includes only sections with content", () => {
  const doc = buildNoteDocument({
    title: "视频标题",
    sourceUrl: "https://x/y",
    platform: "youtube",
    author: "UP",
    exportedAt: "2026-04-06",
    summary,
    comments: null,
    mindmap: null,
    labels
  })

  expect(doc.title).toBe("视频标题")
  expect(doc.meta).toEqual({ sourceUrl: "https://x/y", platform: "youtube", author: "UP", exportedAt: "2026-04-06" })
  expect(doc.sections.map(s => s.heading)).toEqual(["视频总结"])
})

it("renders chapter timestamps as M:SS text", () => {
  const doc = buildNoteDocument({
    title: "t", sourceUrl: "u", platform: "youtube", exportedAt: "2026-04-06",
    summary, comments: null, mindmap: null, labels
  })
  const summarySection = doc.sections[0]
  const bulletTexts = summarySection.blocks
    .filter(b => b.kind === "bullet")
    .map(b => (b as any).text.map((t: any) => t.text).join(""))
  expect(bulletTexts.some(t => t.includes("1:30") && t.includes("开场"))).toBe(true)
})

it("adds comments and mindmap sections when present", () => {
  const comments: CommentAnalysis = {
    consensus: [{ point: "共识1", heat: "high" }],
    divergences: [{ topic: "话题", sideA: "A", sideB: "B", rootCause: "根因" }],
    gap: { hit: "命中", miss: "盲区" },
    mood: ["催更", "理性"],
    spotlight: ["神回复"]
  }
  const doc = buildNoteDocument({
    title: "t", sourceUrl: "u", platform: "bilibili", exportedAt: "2026-04-06",
    summary: null, comments, mindmap: "# 根\n- 枝", labels
  })
  expect(doc.sections.map(s => s.heading)).toEqual(["舆情报告", "思维导图"])
})
