export type Section = "summary" | "comments" | "mindmap"

export type ExportStructure =
  | "summary"
  | "summary_comments"
  | "summary_mindmap"
  | "summary_comments_mindmap"

export const EXPORT_STRUCTURES: ExportStructure[] = [
  "summary",
  "summary_comments",
  "summary_mindmap",
  "summary_comments_mindmap"
]

const MAP: Record<ExportStructure, Section[]> = {
  summary: ["summary"],
  summary_comments: ["summary", "comments"],
  summary_mindmap: ["summary", "mindmap"],
  summary_comments_mindmap: ["summary", "comments", "mindmap"]
}

export function structureToSections(structure: ExportStructure): Set<Section> {
  return new Set(MAP[structure] ?? MAP.summary)
}
