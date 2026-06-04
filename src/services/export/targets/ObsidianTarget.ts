import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"
import { DownloadTarget } from "./DownloadTarget"

export const OBSIDIAN_MAX_CONTENT = 8000

export type ObsidianRequest =
  | { action: "uri"; url: string }
  | { action: "fallback"; markdown: string; filename: string }

export function buildObsidianRequest(input: {
  vault: string
  folder: string
  title: string
  markdown: string
}): ObsidianRequest {
  const encodedContent = encodeURIComponent(input.markdown)
  if (encodedContent.length > OBSIDIAN_MAX_CONTENT) {
    return { action: "fallback", markdown: input.markdown, filename: `${sanitizeFilename(input.title)}.md` }
  }
  const name = sanitizeFilename(input.title)
  const filePath = input.folder ? `${input.folder.replace(/^\/+|\/+$/g, "")}/${name}` : name
  const url =
    `obsidian://new?vault=${encodeURIComponent(input.vault)}` +
    `&file=${encodeURIComponent(filePath)}` +
    `&content=${encodedContent}`
  return { action: "uri", url }
}

export class ObsidianTarget implements ExportTarget {
  id = "obsidian" as const

  constructor(private vault: string, private folder: string = "") {}

  isConfigured(): boolean {
    return this.vault.trim().length > 0
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    const markdown = toMarkdown(doc)
    const req = buildObsidianRequest({ vault: this.vault, folder: this.folder, title: doc.title, markdown })
    if (req.action === "uri") {
      window.open(req.url, "_blank")
      return { kind: "invoked" }
    }
    try {
      await navigator.clipboard.writeText(req.markdown)
    } catch {
      // clipboard may be unavailable; download still covers the user
    }
    new DownloadTarget().download(req.markdown, req.filename)
    return { kind: "fallback-download" }
  }
}
