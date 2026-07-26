import { describe, it, expect } from "vitest"
import { buildObsidianUri, reserveClipboardWrite } from "./ObsidianTarget"

describe("buildObsidianUri", () => {
  it("builds an obsidian://new base uri with vault and file only", () => {
    const url = buildObsidianUri("MyVault", "Videos", "标题")
    expect(url).toContain("obsidian://new?")
    expect(url).toContain("vault=MyVault")
    expect(url).toContain("file=Videos%2F%E6%A0%87%E9%A2%98")
    expect(url).not.toContain("content=")
    expect(url).not.toContain("clipboard")
  })

  it("omits folder prefix when folder empty and sanitizes the title", () => {
    const url = buildObsidianUri("V", "", "a/b:c")
    expect(url).toContain("file=a-b-c")
    expect(url).not.toContain("%2F")
  })

  it("encodes vault names with spaces", () => {
    const url = buildObsidianUri("My Notes", "", "t")
    expect(url).toContain("vault=My%20Notes")
  })
})

describe("reserveClipboardWrite", () => {
  it("does not throw when the clipboard API is unavailable", () => {
    expect(() => reserveClipboardWrite()).not.toThrow()
  })
})
