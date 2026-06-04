import type { NoteDocument } from "../NoteDocument"

export type ExportResultKind = "success" | "invoked" | "fallback-download" | "fallback-clipboard"

export interface ExportResult {
  kind: ExportResultKind
  message?: string
}

export interface ExportTarget {
  id: "notion" | "obsidian" | "download"
  isConfigured(): boolean
  export(doc: NoteDocument): Promise<ExportResult>
}
