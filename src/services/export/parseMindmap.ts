import type { NoteBlock } from "./NoteDocument"

interface FlatNode {
  depth: number
  text: string
}

function flatten(md: string): FlatNode[] {
  const out: FlatNode[] = []
  let headingDepth = 0
  for (const raw of md.split("\n")) {
    if (!raw.trim()) continue
    const heading = raw.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      headingDepth = heading[1].length
      out.push({ depth: headingDepth, text: heading[2].trim() })
      continue
    }
    const list = raw.match(/^(\s*)[-*]\s+(.*)$/)
    if (list) {
      // Normalize tabs to 2 spaces — LLM mindmap output isn't guaranteed to use
      // spaces, and an un-normalized tab (length 1) would floor to indent 0,
      // collapsing a nested item into a sibling.
      const indent = Math.floor(list[1].replace(/\t/g, "  ").length / 2)
      out.push({ depth: headingDepth + 1 + indent, text: list[2].trim() })
      continue
    }
    out.push({ depth: headingDepth + 1, text: raw.trim() })
  }
  return out
}

export function parseMindmap(md: string): NoteBlock[] {
  const flat = flatten(md)
  const roots: NoteBlock[] = []
  const stack: { depth: number; node: Extract<NoteBlock, { kind: "bullet" }> }[] = []

  for (const { depth, text } of flat) {
    const node: Extract<NoteBlock, { kind: "bullet" }> = { kind: "bullet", text: [{ text }] }
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
    if (stack.length === 0) {
      roots.push(node)
    } else {
      const parent = stack[stack.length - 1].node
      ;(parent.children ||= []).push(node)
    }
    stack.push({ depth, node })
  }
  return roots
}
