import type { NoteDocument, NoteBlock, RichText } from "../NoteDocument"

// Notion's API rejects more than two levels of nested children in a single
// request (a top-level block may have children and grandchildren, but a
// grandchild must be a leaf). Bullets therefore nest natively at depth 0 and 1;
// anything deeper (common in mind maps: # / ## / ### / -) is flattened to the
// grandchild level with an indentation prefix so the hierarchy stays legible.
const MAX_CHILD_DEPTH = 1

type Bullet = Extract<NoteBlock, { kind: "bullet" }>

function richText(parts: RichText[]) {
  return parts.map(p => ({
    type: "text",
    text: { content: p.text },
    annotations: p.bold ? { bold: true } : undefined
  }))
}

function bulletItem(parts: RichText[]): any {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(parts) } }
}

/** Flatten a bullet subtree into leaf bullets, prefixing text with indentation
 *  to convey the depth that can no longer be expressed through nesting. */
function flatten(b: Bullet, indent: number): any[] {
  const text = indent > 0 ? [{ text: "  ".repeat(indent) }, ...b.text] : b.text
  const out = [bulletItem(text)]
  for (const c of (b.children ?? []) as Bullet[]) out.push(...flatten(c, indent + 1))
  return out
}

function bulletBlocks(b: Bullet, depth: number): any {
  const item = bulletItem(b.text)
  const kids = (b.children ?? []) as Bullet[]
  if (kids.length) {
    if (depth < MAX_CHILD_DEPTH) {
      item.bulleted_list_item.children = kids.map(c => bulletBlocks(c, depth + 1))
    } else {
      // Children sit at the grandchild level and must be leaves — flatten subtrees.
      item.bulleted_list_item.children = kids.flatMap(c => flatten(c, 0))
    }
  }
  return item
}

function toBlock(b: NoteBlock): any {
  if (b.kind === "heading") {
    const key = b.level === 2 ? "heading_2" : "heading_3"
    return { object: "block", type: key, [key]: { rich_text: richText([{ text: b.text }]) } }
  }
  if (b.kind === "paragraph") {
    return { object: "block", type: "paragraph", paragraph: { rich_text: richText(b.text) } }
  }
  return bulletBlocks(b, 0)
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
