import { describe, it, expect } from "vitest"
import { sanitizeFilename } from "./sanitizeFilename"

describe("sanitizeFilename", () => {
  it("strips illegal characters", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j")
  })
  it("collapses whitespace and trims", () => {
    expect(sanitizeFilename("  hello   world  ")).toBe("hello world")
  })
  it("truncates to 120 chars", () => {
    expect(sanitizeFilename("x".repeat(200)).length).toBe(120)
  })
  it("falls back to 'untitled' when empty", () => {
    expect(sanitizeFilename("///")).toBe("untitled")
  })
})
