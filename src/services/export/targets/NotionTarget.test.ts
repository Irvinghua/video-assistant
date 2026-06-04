import { describe, it, expect, vi } from "vitest"
import { NotionTarget } from "./NotionTarget"
import type { NotionClient } from "../NotionClient"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "u", platform: "youtube", exportedAt: "2026-04-06" },
  sections: [{ heading: "视频总结", blocks: [{ kind: "paragraph", text: [{ text: "正文" }] }] }]
}

it("creates a notion page from the document", async () => {
  const client: NotionClient = { createPage: vi.fn(async () => "pid") }
  const target = new NotionTarget(client, "parent-123")

  const result = await target.export(doc)

  expect(result.kind).toBe("success")
  expect(client.createPage).toHaveBeenCalledWith("parent-123", "标题", expect.any(Array))
})

it("is not configured without a parent id", () => {
  const client: NotionClient = { createPage: vi.fn() }
  expect(new NotionTarget(client, "").isConfigured()).toBe(false)
  expect(new NotionTarget(client, "p").isConfigured()).toBe(true)
})
