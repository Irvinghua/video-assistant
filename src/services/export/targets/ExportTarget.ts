import type { NoteDocument } from "../NoteDocument"

export type ExportResultKind = "success" | "invoked" | "fallback-download" | "fallback-clipboard"

export interface ExportResult {
  kind: ExportResultKind
  message?: string
}

export interface ClipboardReservation {
  commit(text: string): Promise<boolean>
}

export interface ExportOptions {
  clipboard?: ClipboardReservation
}

export interface ExportTarget {
  id: "notion" | "obsidian" | "download"
  isConfigured(): boolean
  export(doc: NoteDocument, opts?: ExportOptions): Promise<ExportResult>
}
