import { describe, it, expect } from "vitest"
import { parseMindmap } from "./parseMindmap"

describe("parseMindmap", () => {
  it("nests headings and list items into a bullet tree", () => {
    const md = [
      "# 主题",
      "## 章节A",
      "- 要点1",
      "  - 细节1",
      "## 章节B"
    ].join("\n")

    const tree = parseMindmap(md)

    expect(tree).toEqual([
      {
        kind: "bullet",
        text: [{ text: "主题" }],
        children: [
          {
            kind: "bullet",
            text: [{ text: "章节A" }],
            children: [
              {
                kind: "bullet",
                text: [{ text: "要点1" }],
                children: [{ kind: "bullet", text: [{ text: "细节1" }] }]
              }
            ]
          },
          { kind: "bullet", text: [{ text: "章节B" }] }
        ]
      }
    ])
  })

  it("ignores empty lines and returns [] for blank input", () => {
    expect(parseMindmap("\n\n   \n")).toEqual([])
  })

  it("treats tab-indented list items as nested (normalizes tabs to 2 spaces)", () => {
    const md = "- 父\n\t- 子"
    expect(parseMindmap(md)).toEqual([
      { kind: "bullet", text: [{ text: "父" }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
    ])
  })

  it("handles 4-space indentation, keeping same-indent items as siblings", () => {
    const md = "- a\n    - b\n    - c"
    expect(parseMindmap(md)).toEqual([
      {
        kind: "bullet",
        text: [{ text: "a" }],
        children: [
          { kind: "bullet", text: [{ text: "b" }] },
          { kind: "bullet", text: [{ text: "c" }] }
        ]
      }
    ])
  })
})
