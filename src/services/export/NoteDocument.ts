export interface RichText {
  text: string
  bold?: boolean
}

export type NoteBlock =
  | { kind: "paragraph"; text: RichText[] }
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "bullet"; text: RichText[]; children?: NoteBlock[] }

export interface NoteSection {
  heading: string
  blocks: NoteBlock[]
}

export interface NoteMeta {
  sourceUrl: string
  platform: string
  author?: string
  exportedAt: string // YYYY-MM-DD
}

export interface NoteDocument {
  title: string
  meta: NoteMeta
  sections: NoteSection[]
}
