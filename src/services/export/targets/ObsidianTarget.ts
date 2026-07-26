import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult, ExportOptions, ClipboardReservation } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"
import { DownloadTarget } from "./DownloadTarget"

const CLIPBOARD_FALLBACK =
  "The note body was copied to your clipboard. If this note appears empty, " +
  "paste the clipboard content (Ctrl/Cmd+V), or see " +
  "https://help.obsidian.md/web-clipper/troubleshoot"

export function buildObsidianUri(vault: string, folder: string, title: string): string {
  const name = sanitizeFilename(title)
  const filePath = folder ? `${folder.replace(/^\/+|\/+$/g, "")}/${name}` : name
  return (
    `obsidian://new?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(filePath)}`
  )
}

export function reserveClipboardWrite(): ClipboardReservation | null {
  const clip = (globalThis as any).navigator?.clipboard
  if (!clip || typeof clip.write !== "function") return null
  if (typeof ClipboardItem === "undefined") return null
  let resolveText: (t: string) => void = () => {}
  const textPromise = new Promise<string>((resolve) => {
    resolveText = resolve
  })
  const blobPromise = textPromise.then((t) => new Blob([t], { type: "text/plain" }))
  let item: ClipboardItem
  try {
    item = new ClipboardItem({ "text/plain": blobPromise })
  } catch {
    return null
  }
  let writePromise: Promise<void>
  try {
    writePromise = clip.write([item]) as Promise<void>
  } catch {
    return null
  }
  return {
    async commit(text: string): Promise<boolean> {
      resolveText(text)
      try {
        await writePromise
        return true
      } catch {
        return false
      }
    }
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* legacy fallback below */
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

  async export(doc: NoteDocument, opts?: ExportOptions): Promise<ExportResult> {
    const markdown = toMarkdown(doc)
    let writePath = "none"
    let copied = await copyToClipboard(markdown)
    if (copied) {
      writePath = "writeText"
    } else if (opts?.clipboard) {
      copied = await opts.clipboard.commit(markdown)
      if (copied) writePath = "lazy"
    }
    const diag = `write=${writePath} vault="${this.vault}" folder="${this.folder}"`
    const uri =
      buildObsidianUri(this.vault, this.folder, doc.title) +
      `&clipboard&content=${encodeURIComponent(CLIPBOARD_FALLBACK)}`
    console.log("[VA-Obsidian]", diag, "uriLen=", uri.length, "uri=", uri)
    if (!copied) {
      new DownloadTarget().download(markdown, `${sanitizeFilename(doc.title)}.md`)
      return { kind: "fallback-download", message: `${diag} write=none` }
    }
    openUri(uri)
    return { kind: "invoked", message: diag }
  }
}
