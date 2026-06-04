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

export function toMarkdown(doc: NoteDocument): string {
  const out: string[] = [`# ${doc.title}`, ""]
  const m = doc.meta
  out.push(`${m.platform} · ${m.sourceUrl}`)
  if (m.author) out.push(`@${m.author}`)
  out.push(m.exportedAt, "")
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, "")
    for (const b of section.blocks) block(b, 0, out)
    out.push("")
  }
  return out.join("\n")
}
