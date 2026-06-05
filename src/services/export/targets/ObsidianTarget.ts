import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"
import { DownloadTarget } from "./DownloadTarget"

/**
 * Build a short obsidian://new link that tells Obsidian to fill the new note
 * from the system clipboard (the core-supported `clipboard` flag). The note
 * body is NOT carried in the URL, so there is no length limit — unlike inline
 * `content=`, which silently breaks for longer notes due to OS/URL length caps.
 */
export function buildObsidianUri(vault: string, folder: string, title: string): string {
  const name = sanitizeFilename(title)
  const filePath = folder ? `${folder.replace(/^\/+|\/+$/g, "")}/${name}` : name
  return (
    `obsidian://new?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(filePath)}` +
    `&clipboard=true`
  )
}

/**
 * Copy text to the system clipboard. Tries the async Clipboard API first, then
 * falls back to the legacy execCommand path — which still works when transient
 * activation has been lost (our handler awaits the cache read before this runs,
 * so the original click gesture is usually already consumed).
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.top = "-9999px"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Launch a custom-protocol URI without leaving a blank tab behind. */
function openUri(uri: string): void {
  const a = document.createElement("a")
  a.href = uri
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export class ObsidianTarget implements ExportTarget {
  id = "obsidian" as const

  constructor(private vault: string, private folder: string = "") {}

  isConfigured(): boolean {
    return this.vault.trim().length > 0
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    const markdown = toMarkdown(doc)
    const copied = await copyToClipboard(markdown)
    if (!copied) {
      // Clipboard unavailable — download the file so the content isn't lost.
      new DownloadTarget().download(markdown, `${sanitizeFilename(doc.title)}.md`)
      return { kind: "fallback-download" }
    }
    openUri(buildObsidianUri(this.vault, this.folder, doc.title))
    return { kind: "invoked" }
  }
}
