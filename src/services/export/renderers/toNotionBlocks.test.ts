import { describe, it, expect } from "vitest"
import { toNotionBlocks } from "./toNotionBlocks"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "https://x/y", platform: "youtube", exportedAt: "2026-04-06" },
  sections: [
    {
      heading: "视频总结",
      blocks: [
        { kind: "paragraph", text: [{ text: "正文" }] },
        { kind: "bullet", text: [{ text: "父", bold: true }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
      ]
    }
  ]
}

it("emits section heading_2 and nested bulleted_list_item", () => {
  const blocks = toNotionBlocks(doc)
  const sectionHeading = blocks.find((b: any) => b.type === "heading_2")
  expect(sectionHeading.heading_2.rich_text[0].text.content).toBe("视频总结")

  const bullet: any = blocks.find((b: any) => b.type === "bulleted_list_item")
  expect(bullet.bulleted_list_item.rich_text[0].text.content).toBe("父")
  expect(bullet.bulleted_list_item.rich_text[0].annotations.bold).toBe(true)
  expect(bullet.bulleted_list_item.children[0].bulleted_list_item.rich_text[0].text.content).toBe("子")
})
