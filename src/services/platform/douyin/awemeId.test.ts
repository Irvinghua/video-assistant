import { describe, it, expect } from "vitest"
import { extractAwemeId } from "./awemeId"

describe("extractAwemeId", () => {
  it("reads /video/{id} path form", () => {
    expect(extractAwemeId("https://www.douyin.com/video/7650813418760359203")).toBe("7650813418760359203")
  })
  it("reads jingxuan modal_id form", () => {
    expect(extractAwemeId("https://www.douyin.com/jingxuan?modal_id=7623684607510088998")).toBe("7623684607510088998")
  })
  it("prefers modal_id on user-page form (modal_id + vid)", () => {
    expect(extractAwemeId("https://www.douyin.com/user/MS4wABC?from_tab_name=main&modal_id=7650813418760359203&vid=7650813418760359203")).toBe("7650813418760359203")
  })
  it("falls back to vid when only vid present", () => {
    expect(extractAwemeId("https://www.douyin.com/user/MS4wABC?vid=7650813418760359203")).toBe("7650813418760359203")
  })
  it("returns null on the feed home with no video", () => {
    expect(extractAwemeId("https://www.douyin.com/jingxuan")).toBeNull()
  })
  it("returns null on a non-numeric id", () => {
    expect(extractAwemeId("https://www.douyin.com/video/abc")).toBeNull()
  })
  it("returns null on garbage input", () => {
    expect(extractAwemeId("not a url")).toBeNull()
  })
})
