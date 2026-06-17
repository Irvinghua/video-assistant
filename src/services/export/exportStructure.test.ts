import { describe, it, expect } from "vitest"
import { orderSections, parseSections, SECTION_ORDER, DEFAULT_SECTIONS } from "./exportStructure"

describe("orderSections", () => {
  it("reorders an arbitrary selection into canonical order", () => {
    expect(orderSections(["mindmap", "transcript", "summary"])).toEqual(["transcript", "summary", "mindmap"])
  })
  it("drops duplicates and unknowns", () => {
    expect(orderSections(["summary", "summary", "bogus" as any])).toEqual(["summary"])
  })
})

describe("parseSections", () => {
  it("reads the new array setting, normalized to canonical order", () => {
    expect(parseSections(["comments", "transcript"])).toEqual(["transcript", "comments"])
  })

  it("migrates the legacy enum when no array is stored", () => {
    expect(parseSections(undefined, "summary_comments_mindmap")).toEqual(["summary", "comments", "mindmap"])
    expect(parseSections(null, "summary_mindmap")).toEqual(["summary", "mindmap"])
  })

  it("prefers the array over the legacy enum", () => {
    expect(parseSections(["transcript"], "summary_comments")).toEqual(["transcript"])
  })

  it("falls back to default (summary) for empty/invalid input", () => {
    expect(parseSections([])).toEqual(DEFAULT_SECTIONS)
    expect(parseSections(["bogus" as any])).toEqual(DEFAULT_SECTIONS)
    expect(parseSections(undefined, "nonsense")).toEqual(DEFAULT_SECTIONS)
    expect(parseSections(undefined)).toEqual(DEFAULT_SECTIONS)
  })

  it("exposes the canonical order transcript→summary→comments→mindmap", () => {
    expect(SECTION_ORDER).toEqual(["transcript", "summary", "comments", "mindmap"])
  })
})
