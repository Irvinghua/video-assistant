import { it, expect } from "vitest"
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

it("caps bullet nesting at Notion's 2-level limit, flattening deeper levels with indentation", () => {
  // # L0 / ## L1 / ### L2 / - L3  → a 4-level bullet tree (depth 0..3)
  const deepDoc: NoteDocument = {
    title: "t",
    meta: { sourceUrl: "u", platform: "youtube", exportedAt: "2026-06-05" },
    sections: [{
      heading: "思维导图",
      blocks: [{
        kind: "bullet", text: [{ text: "L0" }], children: [{
          kind: "bullet", text: [{ text: "L1" }], children: [{
            kind: "bullet", text: [{ text: "L2" }], children: [{
              kind: "bullet", text: [{ text: "L3" }]
            }]
          }]
        }]
      }]
    }]
  }
  const blocks = toNotionBlocks(deepDoc)
  const l0 = blocks.find((b: any) => b.type === "bulleted_list_item")
  const l1 = l0.bulleted_list_item.children[0]
  const depth2 = l1.bulleted_list_item.children // depth-2 blocks
  const l2 = depth2.find((b: any) => b.bulleted_list_item.rich_text.map((r: any) => r.text.content).join("").includes("L2"))
  // No block may nest beyond depth 2: depth-2 blocks must be leaves
  for (const b of depth2) expect(b.bulleted_list_item.children).toBeUndefined()
  // L3's content is preserved, flattened to depth 2 as a sibling (with indentation)
  const texts = depth2.map((b: any) => b.bulleted_list_item.rich_text.map((r: any) => r.text.content).join(""))
  expect(texts.some(t => t.includes("L3"))).toBe(true)
  expect(l2).toBeTruthy()
})
