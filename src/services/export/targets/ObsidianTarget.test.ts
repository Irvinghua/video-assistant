import { describe, it, expect } from "vitest"
import { buildObsidianRequest, OBSIDIAN_MAX_CONTENT } from "./ObsidianTarget"

it("builds an obsidian://new uri for short content", () => {
  const req = buildObsidianRequest({ vault: "MyVault", folder: "Videos", title: "标题", markdown: "# hi" })
  expect(req.action).toBe("uri")
  if (req.action !== "uri") throw new Error("expected uri")
  expect(req.url).toContain("obsidian://new?")
  expect(req.url).toContain("vault=MyVault")
  expect(req.url).toContain("file=Videos%2F%E6%A0%87%E9%A2%98")
  expect(req.url).toContain("content=")
})

it("omits folder prefix when folder empty and sanitizes title", () => {
  const req = buildObsidianRequest({ vault: "V", folder: "", title: "a/b:c", markdown: "x" })
  if (req.action !== "uri") throw new Error("expected uri")
  expect(req.url).toContain("file=a-b-c")
  expect(req.url).not.toContain("%2F")
})

it("falls back when content exceeds the limit", () => {
  const big = "x".repeat(OBSIDIAN_MAX_CONTENT + 1)
  const req = buildObsidianRequest({ vault: "V", folder: "", title: "t", markdown: big })
  expect(req.action).toBe("fallback")
  if (req.action !== "fallback") throw new Error("expected fallback")
  expect(req.filename).toBe("t.md")
  expect(req.markdown).toBe(big)
})
