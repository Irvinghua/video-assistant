import { describe, it, expect } from "vitest"
import { structureToSections, EXPORT_STRUCTURES, type ExportStructure } from "./exportStructure"

describe("structureToSections", () => {
  it("maps each structure to its section set", () => {
    expect([...structureToSections("summary")]).toEqual(["summary"])
    expect([...structureToSections("summary_comments")].sort()).toEqual(["comments", "summary"])
    expect([...structureToSections("summary_mindmap")].sort()).toEqual(["mindmap", "summary"])
    expect([...structureToSections("summary_comments_mindmap")].sort()).toEqual(["comments", "mindmap", "summary"])
  })

  it("falls back to summary-only for unknown values", () => {
    expect([...structureToSections("bogus" as ExportStructure)]).toEqual(["summary"])
  })

  it("lists all four structures in order", () => {
    expect(EXPORT_STRUCTURES).toEqual([
      "summary", "summary_comments", "summary_mindmap", "summary_comments_mindmap"
    ])
  })
})
