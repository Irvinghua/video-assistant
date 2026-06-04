import { describe, it, expect } from "vitest"
import { buildVideoUrl } from "./buildVideoUrl"

describe("buildVideoUrl", () => {
  it("builds youtube watch url", () => {
    expect(buildVideoUrl("youtube", "abc123")).toBe("https://www.youtube.com/watch?v=abc123")
  })
  it("builds bilibili video url", () => {
    expect(buildVideoUrl("bilibili", "BV1xx")).toBe("https://www.bilibili.com/video/BV1xx")
  })
  it("falls back to empty string for unknown platform", () => {
    expect(buildVideoUrl("unknown", "x")).toBe("")
  })
})
