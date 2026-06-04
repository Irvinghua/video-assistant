import type { SummaryResult, CommentAnalysis } from "../ai/types"
import type { NoteDocument, NoteSection, NoteBlock } from "./NoteDocument"
import { parseMindmap } from "./parseMindmap"

export interface NoteLabels {
  summarySection: string
  commentsSection: string
  mindmapSection: string
  oneLiner: string
  keyPoints: string
  fullDigest: string
  consensus: string
  divergences: string
  gap: string
  gapHit: string
  gapMiss: string
  mood: string
  spotlight: string
  source: string
  author: string
  exportedAt: string
}

export interface BuildInput {
  title: string
  sourceUrl: string
  platform: string
  author?: string
  exportedAt: string
  summary: SummaryResult | null
  comments: CommentAnalysis | null
  mindmap: string | null
  labels: NoteLabels
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function summarySection(s: SummaryResult, l: NoteLabels): NoteSection {
  const blocks: NoteBlock[] = [
    { kind: "heading", level: 3, text: l.oneLiner },
    { kind: "paragraph", text: [{ text: s.oneLiner }] },
    { kind: "heading", level: 3, text: l.keyPoints }
  ]
  for (const c of s.chapters) {
    blocks.push({
      kind: "bullet",
      text: [{ text: `${fmtTime(c.timestamp)} `, bold: true }, { text: c.title, bold: true }],
      children: [{ kind: "bullet", text: [{ text: c.summary }] }]
    })
  }
  blocks.push({ kind: "heading", level: 3, text: l.fullDigest })
  blocks.push({ kind: "paragraph", text: [{ text: s.fullDigest }] })
  return { heading: l.summarySection, blocks }
}

function commentsSection(a: CommentAnalysis, l: NoteLabels): NoteSection {
  const blocks: NoteBlock[] = [{ kind: "heading", level: 3, text: l.consensus }]
  for (const c of a.consensus) {
    blocks.push({ kind: "bullet", text: [{ text: c.point }, { text: `（${c.heat}）` }] })
  }
  blocks.push({ kind: "heading", level: 3, text: l.divergences })
  for (const d of a.divergences) {
    blocks.push({
      kind: "bullet",
      text: [{ text: d.topic, bold: true }],
      children: [
        { kind: "bullet", text: [{ text: `A: ${d.sideA}` }] },
        { kind: "bullet", text: [{ text: `B: ${d.sideB}` }] },
        { kind: "bullet", text: [{ text: d.rootCause }] }
      ]
    })
  }
  blocks.push({ kind: "heading", level: 3, text: l.gap })
  blocks.push({ kind: "bullet", text: [{ text: `${l.gapHit}: `, bold: true }, { text: a.gap.hit }] })
  blocks.push({ kind: "bullet", text: [{ text: `${l.gapMiss}: `, bold: true }, { text: a.gap.miss }] })
  blocks.push({ kind: "heading", level: 3, text: l.mood })
  blocks.push({ kind: "paragraph", text: [{ text: a.mood.join(" / ") }] })
  blocks.push({ kind: "heading", level: 3, text: l.spotlight })
  for (const sp of a.spotlight) {
    blocks.push({ kind: "bullet", text: [{ text: sp }] })
  }
  return { heading: l.commentsSection, blocks }
}

export function buildNoteDocument(input: BuildInput): NoteDocument {
  const { labels: l } = input
  const sections: NoteSection[] = []
  if (input.summary) sections.push(summarySection(input.summary, l))
  if (input.comments) sections.push(commentsSection(input.comments, l))
  if (input.mindmap && input.mindmap.trim()) {
    sections.push({ heading: l.mindmapSection, blocks: parseMindmap(input.mindmap) })
  }
  return {
    title: input.title,
    meta: {
      sourceUrl: input.sourceUrl,
      platform: input.platform,
      author: input.author,
      exportedAt: input.exportedAt
    },
    sections
  }
}
