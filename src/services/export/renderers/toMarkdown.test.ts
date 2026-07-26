import { it, expect } from "vitest"
import { toMarkdown } from "./toMarkdown"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "https://x/y", platform: "youtube", author: "UP", exportedAt: "2026-04-06" },
  sections: [
    {
      heading: "视频总结",
      blocks: [
        { kind: "heading", level: 3, text: "一句话简介" },
        { kind: "paragraph", text: [{ text: "正文" }] },
        { kind: "bullet", text: [{ text: "父", bold: true }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
      ]
    }
  ]
}

it("renders title, meta and nested bullets", () => {
  const md = toMarkdown(doc)
  expect(md.startsWith("# 标题\n")).toBe(true)
  expect(md).not.toContain("markmap:")
  expect(md).toContain("https://x/y")
  expect(md).toContain("## 视频总结")
  expect(md).toContain("### 一句话简介")
  expect(md).toContain("- **父**")
  expect(md).toContain("  - 子")
})

it("wraps mindmap sections in a markmap fence with a content-sized height", () => {
  const mindmapDoc: NoteDocument = {
    title: "标题",
    meta: { sourceUrl: "https://x/y", platform: "youtube", exportedAt: "2026-04-06" },
    sections: [
      {
        heading: "思维导图",
        kind: "mindmap",
        blocks: [
          { kind: "bullet", text: [{ text: "根" }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
        ]
      }
    ]
  }
  const md = toMarkdown(mindmapDoc)
  expect(md.startsWith("# 标题\n")).toBe(true)
  expect(md).toContain("## 思维导图")
  expect(md).toContain("```markmap\n---\nmarkmap:\n  height: 320\n---\n# 标题\n- 根\n  - 子\n```")
})

it("scales mindmap height with the number of leaves", () => {
  const leaves = Array.from({ length: 20 }, (_, i) => ({ kind: "bullet" as const, text: [{ text: `n${i}` }] }))
  const mindmapDoc: NoteDocument = {
    title: "t",
    meta: { sourceUrl: "u", platform: "youtube", exportedAt: "2026-04-06" },
    sections: [{ heading: "思维导图", kind: "mindmap", blocks: [{ kind: "bullet", text: [{ text: "根" }], children: leaves }] }]
  }
  const md = toMarkdown(mindmapDoc)
  expect(md).toContain("height: 680")
})
