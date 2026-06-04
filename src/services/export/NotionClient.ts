import type { FetchProxy } from "./fetchProxy"
import { backgroundFetchProxy } from "./fetchProxy"

const NOTION_VERSION = "2022-06-28"
const MAX_BLOCKS = 100

export interface NotionClient {
  createPage(parentPageId: string, title: string, blocks: any[]): Promise<string>
}

function mapError(status: number | undefined, raw: string): Error {
  if (status === 401) return new Error("NOTION_UNAUTHORIZED")
  if (status === 404) return new Error("NOTION_PARENT_NOT_FOUND")
  if (status === 429) return new Error("NOTION_RATE_LIMITED")
  return new Error(`NOTION_ERROR: ${raw}`)
}

export class TokenNotionClient implements NotionClient {
  constructor(private token: string, private proxy: FetchProxy = backgroundFetchProxy) {}

  private headers() {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  }

  async createPage(parentPageId: string, title: string, blocks: any[]): Promise<string> {
    const first = blocks.slice(0, MAX_BLOCKS)
    const rest = blocks.slice(MAX_BLOCKS)

    const createResp = await this.proxy("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: { title: { title: [{ text: { content: title } }] } },
        children: first
      })
    })
    if (!createResp.success) throw mapError(createResp.status, (createResp as { success: false; error: string; status?: number }).error)
    const pageId = createResp.data.id as string

    for (let i = 0; i < rest.length; i += MAX_BLOCKS) {
      const batch = rest.slice(i, i + MAX_BLOCKS)
      const appendResp = await this.proxy(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ children: batch })
      })
      if (!appendResp.success) throw mapError(appendResp.status, (appendResp as { success: false; error: string; status?: number }).error)
    }
    return pageId
  }
}
