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
  expect(md).toContain("# 标题")
  expect(md).toContain("https://x/y")
  expect(md).toContain("## 视频总结")
  expect(md).toContain("### 一句话简介")
  expect(md).toContain("- **父**")
  expect(md).toContain("  - 子")
})
