import type { NoteDocument, NoteBlock, RichText } from "../NoteDocument"

function rich(parts: RichText[]): string {
  return parts.map(p => (p.bold ? `**${p.text}**` : p.text)).join("")
}

function block(b: NoteBlock, depth: number, out: string[]): void {
  if (b.kind === "heading") {
    out.push(`${"#".repeat(b.level)} ${b.text}`)
  } else if (b.kind === "paragraph") {
    out.push(rich(b.text))
  } else {
    out.push(`${"  ".repeat(depth)}- ${rich(b.text)}`)
    for (const child of b.children ?? []) block(child, depth + 1, out)
  }
}

const LEAF_PX = 30
const HEIGHT_PAD = 80
const HEIGHT_MIN = 320
const HEIGHT_MAX = 4000

function countLeaves(blocks: NoteBlock[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.kind === "bullet" && b.children?.length) n += countLeaves(b.children)
    else n += 1
  }
  return n
}

function mindmapHeight(blocks: NoteBlock[]): number {
  const h = countLeaves(blocks) * LEAF_PX + HEIGHT_PAD
  return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, h))
}

export function toMarkdown(doc: NoteDocument): string {
  const out: string[] = [`# ${doc.title}`, ""]
  const m = doc.meta
  out.push(`${m.platform} · ${m.sourceUrl}`)
  if (m.author) out.push(`@${m.author}`)
  out.push(m.exportedAt, "")
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, "")
    if (section.kind === "mindmap") {
      const root = doc.title.replace(/\s*\n+\s*/g, " ").trim()
      const inner: string[] = [`# ${root}`]
      for (const b of section.blocks) block(b, 0, inner)
      const height = mindmapHeight(section.blocks)
      out.push("```markmap", "---", "markmap:", `  height: ${height}`, "---", ...inner, "```", "")
    } else {
      for (const b of section.blocks) block(b, 0, out)
      out.push("")
    }
  }
  return out.join("\n")
}
