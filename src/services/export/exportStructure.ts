export type Section = "transcript" | "summary" | "comments" | "mindmap"

/**
 * Canonical order — drives BOTH the settings checkbox listing and the order
 * sections are assembled into the exported note. Selecting a subset preserves
 * this order; missing sections are simply skipped without shifting the rest.
 */
export const SECTION_ORDER: Section[] = ["transcript", "summary", "comments", "mindmap"]

/** Selected when the user has never configured (or somehow cleared) the choice. */
export const DEFAULT_SECTIONS: Section[] = ["summary"]

function isSection(v: unknown): v is Section {
  return typeof v === "string" && (SECTION_ORDER as string[]).includes(v)
}

/** Reorder an arbitrary selection into canonical order, dropping unknowns/dupes. */
export function orderSections(selected: Iterable<Section>): Section[] {
  const set = new Set(selected)
  return SECTION_ORDER.filter(s => set.has(s))
}

// Legacy single-select enum (pre-checkbox). Kept only to migrate stored values.
const LEGACY_MAP: Record<string, Section[]> = {
  summary: ["summary"],
  summary_comments: ["summary", "comments"],
  summary_mindmap: ["summary", "mindmap"],
  summary_comments_mindmap: ["summary", "comments", "mindmap"]
}

/**
 * Resolve the persisted setting into an ordered, non-empty Section[].
 * Prefers the new `exportSections` array; falls back to migrating the legacy
 * `exportStructure` enum; finally defaults to summary-only.
 */
export function parseSections(stored: unknown, legacy?: unknown): Section[] {
  if (Array.isArray(stored)) {
    const valid = stored.filter(isSection)
    if (valid.length) return orderSections(valid)
  }
  if (typeof legacy === "string" && LEGACY_MAP[legacy]) {
    return orderSections(LEGACY_MAP[legacy])
  }
  return [...DEFAULT_SECTIONS]
}
