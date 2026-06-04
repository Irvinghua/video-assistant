import { describe, it, expect, vi } from "vitest"
import { TokenNotionClient } from "./NotionClient"
import type { ProxyResponse } from "./fetchProxy"

function makeProxy(responses: ProxyResponse[]) {
  const calls: { url: string; options: any }[] = []
  const fn = vi.fn(async (url: string, options: any) => {
    calls.push({ url, options })
    return responses.shift()!
  })
  return { fn, calls }
}

it("creates a child page under the parent page", async () => {
  const { fn, calls } = makeProxy([{ success: true, data: { id: "new-page-id" }, status: 200 }])
  const client = new TokenNotionClient("secret_x", fn)

  await client.createPage("parent-123", "我的标题", [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }])

  expect(calls[0].url).toBe("https://api.notion.com/v1/pages")
  const body = JSON.parse(calls[0].options.body)
  expect(body.parent).toEqual({ page_id: "parent-123" })
  expect(body.properties.title.title[0].text.content).toBe("我的标题")
  expect(calls[0].options.headers.Authorization).toBe("Bearer secret_x")
  expect(calls[0].options.headers["Notion-Version"]).toBeTruthy()
})

it("batches blocks beyond 100 via append", async () => {
  const blocks = Array.from({ length: 150 }, () => ({ object: "block", type: "paragraph", paragraph: { rich_text: [] } }))
  const { fn, calls } = makeProxy([
    { success: true, data: { id: "pid" }, status: 200 },
    { success: true, data: {}, status: 200 }
  ])
  const client = new TokenNotionClient("secret_x", fn)

  await client.createPage("parent", "t", blocks)

  expect(JSON.parse(calls[0].options.body).children.length).toBe(100)
  expect(calls[1].url).toBe("https://api.notion.com/v1/blocks/pid/children")
  expect(JSON.parse(calls[1].options.body).children.length).toBe(50)
})

it("maps 401 to an invalid-token error", async () => {
  const { fn } = makeProxy([{ success: false, error: "HTTP 401: unauthorized", status: 401 }])
  const client = new TokenNotionClient("bad", fn)
  await expect(client.createPage("p", "t", [])).rejects.toThrow("NOTION_UNAUTHORIZED")
})
