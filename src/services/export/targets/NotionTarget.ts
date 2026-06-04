import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import type { NotionClient } from "../NotionClient"
import { toNotionBlocks } from "../renderers/toNotionBlocks"

export class NotionTarget implements ExportTarget {
  id = "notion" as const

  constructor(private client: NotionClient, private parentPageId: string) {}

  isConfigured(): boolean {
    return this.parentPageId.trim().length > 0
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    await this.client.createPage(this.parentPageId, doc.title, toNotionBlocks(doc))
    return { kind: "success" }
  }
}
