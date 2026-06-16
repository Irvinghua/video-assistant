import { describe, it, expect } from "vitest"
import { buildVideoUrl } from "./buildVideoUrl"

describe("buildVideoUrl", () => {
  it("builds youtube watch url", () => {
    expect(buildVideoUrl("youtube", "abc123")).toBe("https://www.youtube.com/watch?v=abc123")
  })
  it("builds bilibili video url", () => {
    expect(buildVideoUrl("bilibili", "BV1xx")).toBe("https://www.bilibili.com/video/BV1xx")
  })
  it("builds douyin video url", () => {
    expect(buildVideoUrl("douyin", "7650813418760359203")).toBe("https://www.douyin.com/video/7650813418760359203")
  })
  it("falls back to empty string for unknown platform", () => {
    expect(buildVideoUrl("unknown", "x")).toBe("")
  })
})
