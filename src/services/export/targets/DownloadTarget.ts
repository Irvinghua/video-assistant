import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"

export class DownloadTarget implements ExportTarget {
  id = "download" as const

  isConfigured(): boolean {
    return true
  }

  download(content: string, filename: string): void {
    const blob = new Blob([content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    this.download(toMarkdown(doc), `${sanitizeFilename(doc.title)}.md`)
    return { kind: "success" }
  }
}
