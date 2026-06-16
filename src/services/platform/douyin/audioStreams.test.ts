import { describe, it, expect } from "vitest"
import { pickAudioStreams } from "./audioStreams"

describe("pickAudioStreams", () => {
  it("picks the lowest-bitrate audio stream and returns its CDN srcs in order", () => {
    const video = {
      bitRateAudioList: [
        { bitrate: 193561, urlList: [{ src: "https://v11.cdn/high-a", playApi: "https://www.douyin.com/aweme/v1/play/?x=1" }] },
        { bitrate: 64000, urlList: [{ src: "https://v11.cdn/low-a" }, { src: "https://v26.cdn/low-b" }] },
      ],
      playAddr: { urlList: [{ src: "https://v11.cdn/progressive" }] },
    }
    expect(pickAudioStreams(video)).toEqual(["https://v11.cdn/low-a", "https://v26.cdn/low-b"])
  })

  it("never returns the same-origin playApi, only .src", () => {
    const video = { bitRateAudioList: [{ bitrate: 100, urlList: [{ src: "https://cdn/a", playApi: "https://www.douyin.com/aweme/v1/play/?y=2" }] }] }
    expect(pickAudioStreams(video)).toEqual(["https://cdn/a"])
  })

  it("falls back to progressive playAddr.urlList when no audio list", () => {
    const video = { bitRateAudioList: [], playAddr: { urlList: [{ src: "https://cdn/prog1" }, { src: "https://cdn/prog2" }] } }
    expect(pickAudioStreams(video)).toEqual(["https://cdn/prog1", "https://cdn/prog2"])
  })

  it("handles playAddr given as a plain string array", () => {
    const video = { playAddr: ["https://cdn/p1", "https://cdn/p2"] }
    expect(pickAudioStreams(video)).toEqual(["https://cdn/p1", "https://cdn/p2"])
  })

  it("returns [] for null / empty", () => {
    expect(pickAudioStreams(null)).toEqual([])
    expect(pickAudioStreams({})).toEqual([])
  })
})
