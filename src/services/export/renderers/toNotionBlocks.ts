import type { NoteDocument, NoteBlock, RichText } from "../NoteDocument"

function richText(parts: RichText[]) {
  return parts.map(p => ({
    type: "text",
    text: { content: p.text },
    annotations: p.bold ? { bold: true } : undefined
  }))
}

function toBlock(b: NoteBlock): any {
  if (b.kind === "heading") {
    const key = b.level === 2 ? "heading_2" : "heading_3"
    return { object: "block", type: key, [key]: { rich_text: richText([{ text: b.text }]) } }
  }
  if (b.kind === "paragraph") {
    return { object: "block", type: "paragraph", paragraph: { rich_text: richText(b.text) } }
  }
  const item: any = {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(b.text) }
  }
  if (b.children?.length) item.bulleted_list_item.children = b.children.map(toBlock)
  return item
}

export function toNotionBlocks(doc: NoteDocument): any[] {
  const blocks: any[] = []
  for (const section of doc.sections) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: richText([{ text: section.heading }]) }
    })
    for (const b of section.blocks) blocks.push(toBlock(b))
  }
  return blocks
}
