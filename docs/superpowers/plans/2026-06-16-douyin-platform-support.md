# 抖音平台支持（核心：音频 ASR 摘要）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为本扩展新增抖音网页版平台支持，让用户在抖音三种页面形态（`/video/{id}`、`/jingxuan?modal_id=`、`/user/...?modal_id=`）下，对无 CC 字幕的视频通过「下载音频 → ASR 转写 → 文本摘要 + 时间轴章节导航」生成摘要、思维导图、AskAI。

**Architecture:** 内容脚本（ISOLATED 世界）读不到页面的 `window.player`，因此经 background 的 `chrome.scripting.executeScript({world:"MAIN"})` 桥读取 `window.player.config.awemeInfo`（标题/作者/封面/音频流）与调用 `window.player.seek()`，结果缓存在内容脚本模块中供同步读取；音频用内容脚本 `fetch(credentials:"omit")` 从抖音 CDN 直链下载（复用现有 B 站 `downloadAudio`）；ASR 与摘要完全复用现有 `transcribeLongAudio` + `VideoSummarizer`。SPA 滑动换视频靠 monkeypatch History + 轮询监听 `modal_id` 变化，先 await 桥填充缓存再触发 `VideoProvider` 重新检测。

**Tech Stack:** Plasmo (MV3) + React + TypeScript + Vitest (node 环境，纯函数单测) + Chrome DevTools MCP（浏览器集成验证，EXTENSION_ID=`aianhbkiaienofmmcpcennbnobabpalo`，端口 `127.0.0.1:9223`）。

**配套设计文档：** [`抖音平台支持实现方案.md`](../../../抖音平台支持实现方案.md)、[`抖音网页版字幕音频抓取可行性分析.md`](../../../抖音网页版字幕音频抓取可行性分析.md)。

**范围边界：** 本计划只做核心 ASR 摘要链路。**评论舆情（getComments 的 DOM 抓取）拆到 Plan 2**，本计划中 `DouyinService.getComments` 返回空，CommentsPanel 显示「无评论」属预期。

---

## File Structure

**新建：**
- `src/services/platform/douyin/awemeId.ts` — 纯函数 `extractAwemeId(url)`：从三种 URL 提取视频 id。
- `src/services/platform/douyin/awemeId.test.ts` — 单测。
- `src/services/platform/douyin/audioStreams.ts` — 纯函数 `pickAudioStreams(video)`：从 awemeInfo.video 选出有序音频候选 URL。
- `src/services/platform/douyin/audioStreams.test.ts` — 单测。
- `src/services/platform/douyin/playerBridge.ts` — MAIN 世界桥消息封装 + 模块级 awemeInfo 缓存（`loadAweme` / `getCachedAweme` / `douyinSeek`）。
- `src/services/platform/douyin/DouyinService.ts` — `IPlatformService` 实现。
- `src/contents/douyin.tsx` — 内容脚本入口 + SPA `modal_id` 监听。

**修改：**
- `src/background.ts` — 新增 `READ_DOUYIN_PLAYER`、`DOUYIN_PLAYER_SEEK` 两个消息 handler。
- `src/services/platform/PlatformFactory.ts` — 新增 douyin 分支。
- `src/services/export/buildVideoUrl.ts` — 新增 douyin 分支（导出功能用）。
- `src/services/export/buildVideoUrl.test.ts` — 补 douyin 用例。
- `src/contexts/VideoContext.tsx` — `VideoProvider` 增加可选 `navKey` prop 并加入检测 effect 依赖。
- `src/components/Sidebar/index.tsx` — `Sidebar` 增加可选 `navKey` prop 并透传给 `VideoProvider`。

**关键既有契约（实现时遵循，勿改）：**
- `IPlatformService`（`src/services/platform/types.ts`）：`getPlatformName / detectVideo(): VideoInfo|null / getSubtitles / getComments(): Promise<SampledComments> / supportsDigitalASR(): boolean / getAudioUrl / getAudioUrlCandidates? / seekTo`。
- `VideoInfo = { id, title, author, coverUrl, duration }`。
- `SampledComments = { consensus: Comment[], controversial: Comment[] }`。
- SummaryPanel 在 `subtitles.length===0 && !dataLoading && service.supportsDigitalASR()` 时自动显示「通过 ASR 总结」按钮（调 `handleDigitalASR`）——**DouyinService 让 `getSubtitles` 返回 `[]` 即触发 ASR 按钮，无需改 UI。**
- `useSummary.handleDigitalASR` 已编排 `getAudioUrlCandidates → downloadAudio(credentials:"omit") → transcribeLongAudio → handleSummarize`，DouyinService 实现 `getAudioUrlCandidates` 即可复用。

---

## Task 1: 创建特性分支

**Files:** 无（git 操作）

- [ ] **Step 1: 从 main 新建并切到特性分支**

Run:
```bash
cd /Users/irvinghua/workspace/video-assistant
git checkout -b feat/douyin-platform
```
Expected: `Switched to a new branch 'feat/douyin-platform'`

- [ ] **Step 2: 确认分支**

Run: `git branch --show-current`
Expected: `feat/douyin-platform`

---

## Task 2: `extractAwemeId` 纯函数（URL → 视频 id）

**Files:**
- Create: `src/services/platform/douyin/awemeId.ts`
- Test: `src/services/platform/douyin/awemeId.test.ts`

- [ ] **Step 1: 写失败测试**

`src/services/platform/douyin/awemeId.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/services/platform/douyin/awemeId.test.ts`
Expected: FAIL，报 `extractAwemeId` 未定义 / 模块找不到。

- [ ] **Step 3: 实现**

`src/services/platform/douyin/awemeId.ts`:
```ts
/** Extract the Douyin aweme (video) id from any of the 3 page-form URLs. */
export function extractAwemeId(url: string): string | null {
    try {
        const u = new URL(url)
        const m = u.pathname.match(/\/video\/(\d+)/)
        if (m) return m[1]
        const modalId = u.searchParams.get("modal_id")
        if (modalId && /^\d+$/.test(modalId)) return modalId
        const vid = u.searchParams.get("vid")
        if (vid && /^\d+$/.test(vid)) return vid
        return null
    } catch {
        return null
    }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- src/services/platform/douyin/awemeId.test.ts`
Expected: PASS（7 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/services/platform/douyin/awemeId.ts src/services/platform/douyin/awemeId.test.ts
git commit -m "feat(douyin): extractAwemeId from 3 page-form URLs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `pickAudioStreams` 纯函数（awemeInfo.video → 音频候选 URL）

**Files:**
- Create: `src/services/platform/douyin/audioStreams.ts`
- Test: `src/services/platform/douyin/audioStreams.test.ts`

依据可行性分析 §2.1：音频在 `video.bitRateAudioList[].urlList[].src`（douyinvod CDN 直链，开放 CORS+Range）；**只取 `.src`，绝不取 `.playApi`（同源返回验证码页）**；无音频流时回退渐进式 `video.playAddr`。

- [ ] **Step 1: 写失败测试**

`src/services/platform/douyin/audioStreams.test.ts`:
```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/services/platform/douyin/audioStreams.test.ts`
Expected: FAIL（`pickAudioStreams` 未定义）。

- [ ] **Step 3: 实现**

`src/services/platform/douyin/audioStreams.ts`:
```ts
interface DouyinUrlItem { src?: string }
interface DouyinAudioStream { bitrate?: number; urlList?: DouyinUrlItem[] }

export interface DouyinVideoData {
    bitRateAudioList?: DouyinAudioStream[]
    playAddr?: { urlList?: DouyinUrlItem[] } | Array<DouyinUrlItem | string> | null
}

/**
 * Ordered candidate audio download URLs for ASR.
 * Prefers the lowest-bitrate audio-only DASH stream; falls back to the
 * progressive MP4 (which also carries audio). Returns CDN `.src` URLs ONLY —
 * never the same-origin `playApi` (it returns a captcha page). See 可行性分析 §2.
 */
export function pickAudioStreams(video: DouyinVideoData | null | undefined): string[] {
    if (!video) return []

    const audioList = video.bitRateAudioList || []
    if (audioList.length > 0) {
        const picked = [...audioList].sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0]
        const srcs = (picked?.urlList || []).map(u => u.src).filter((s): s is string => !!s)
        if (srcs.length) return srcs
    }

    const pa = video.playAddr
    const items: Array<DouyinUrlItem | string> = Array.isArray(pa) ? pa : (pa?.urlList || [])
    return items
        .map(it => (typeof it === "string" ? it : it?.src))
        .filter((s): s is string => !!s)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- src/services/platform/douyin/audioStreams.test.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/services/platform/douyin/audioStreams.ts src/services/platform/douyin/audioStreams.test.ts
git commit -m "feat(douyin): pickAudioStreams selects lowest-bitrate CDN audio src

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `buildVideoUrl` 增加 douyin 分支（导出用）

**Files:**
- Modify: `src/services/export/buildVideoUrl.ts`
- Test: `src/services/export/buildVideoUrl.test.ts`

- [ ] **Step 1: 加失败测试**

在 `src/services/export/buildVideoUrl.test.ts` 的 `describe` 块内、`"falls back to empty string..."` 用例之前插入：
```ts
  it("builds douyin video url", () => {
    expect(buildVideoUrl("douyin", "7650813418760359203")).toBe("https://www.douyin.com/video/7650813418760359203")
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- src/services/export/buildVideoUrl.test.ts`
Expected: FAIL（douyin 用例返回 `""`，断言不符）。

- [ ] **Step 3: 实现**

`src/services/export/buildVideoUrl.ts` 改为：
```ts
export function buildVideoUrl(platform: string, videoId: string): string {
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${videoId}`
  if (platform === "bilibili") return `https://www.bilibili.com/video/${videoId}`
  if (platform === "douyin") return `https://www.douyin.com/video/${videoId}`
  return ""
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- src/services/export/buildVideoUrl.test.ts`
Expected: PASS（含 youtube/bilibili/douyin/unknown 全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/buildVideoUrl.ts src/services/export/buildVideoUrl.test.ts
git commit -m "feat(douyin): buildVideoUrl supports douyin platform

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: background 新增 MAIN 世界桥（读 player / seek）

**Files:**
- Modify: `src/background.ts`

无法单测（依赖 `chrome.scripting`），用 MCP 调试循环验证。

- [ ] **Step 1: 在 `chrome.runtime.onMessage.addListener` 内新增两个分支**

在 `src/background.ts` 中 `if (message.type === "OPEN_OPTIONS_PAGE") { ... }` 分支**之前**插入：
```ts
    if (message.type === "READ_DOUYIN_PLAYER") {
        handleReadDouyinPlayer(message.videoId, sender.tab?.id, sendResponse)
        return true
    }

    if (message.type === "DOUYIN_PLAYER_SEEK") {
        handleDouyinSeek(message.seconds, sender.tab?.id, sendResponse)
        return true
    }
```

- [ ] **Step 2: 在文件末尾追加两个 handler 函数**

`src/background.ts` 末尾追加：
```ts
// ─── Douyin: read window.player.config.awemeInfo (MAIN world) ───

async function handleReadDouyinPlayer(
    videoId: string,
    tabId: number | undefined,
    sendResponse: (r: any) => void
) {
    if (!tabId) { sendResponse({ ok: false, reason: "no-tab" }); return }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (wantId: string) => {
                const p: any = (window as any).player
                const a = p?.config?.awemeInfo
                if (!a) return { ok: false, reason: "no-player" }
                // swiper 预加载多实例：校验当前播放器就是目标视频
                if (wantId && a.awemeId !== wantId) return { ok: false, reason: "id-mismatch" }
                const v = a.video || {}
                const cover = (v.coverUrlList && v.coverUrlList[0]) || ""
                return {
                    ok: true,
                    awemeId: a.awemeId,
                    desc: a.desc || "",
                    author: a.authorInfo?.nickname || a.authorInfo?.nickName || "",
                    cover,
                    video: { bitRateAudioList: v.bitRateAudioList || [], playAddr: v.playAddr || null }
                }
            },
            args: [videoId || ""]
        })
        sendResponse(results?.[0]?.result || { ok: false, reason: "no-result" })
    } catch (e) {
        sendResponse({ ok: false, reason: String(e) })
    }
}

async function handleDouyinSeek(
    seconds: number,
    tabId: number | undefined,
    sendResponse: (r: any) => void
) {
    if (!tabId) { sendResponse({ ok: false }); return }
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (sec: number) => {
                try { const p: any = (window as any).player; p?.seek?.(sec); p?.play?.() } catch { }
            },
            args: [seconds]
        })
        sendResponse({ ok: true })
    } catch {
        sendResponse({ ok: false })
    }
}
```

- [ ] **Step 3: 确认编译落地**

Run: `ls -lt build/chrome-mv3-dev/static/background/index.js`
Expected: mtime 是刚才（`pnpm dev` watcher 已增量编译）。若 watcher 未运行，请用户先 `pnpm dev`。

- [ ] **Step 4: MCP 验证桥可读 player**

打开一个抖音视频页后，通过 MCP：
1. 重载插件：`new_page` → `chrome-extension://aianhbkiaienofmmcpcennbnobabpalo/options.html`，`evaluate_script: () => chrome.runtime.reload()`。
2. `list_pages` / `select_page` 选中抖音视频页，`navigate_page`(reload)。
3. 在抖音页 `evaluate_script`：
```js
() => new Promise(res => chrome.runtime.sendMessage(
  { type: "READ_DOUYIN_PLAYER", videoId: new URL(location.href).searchParams.get("modal_id") || (location.pathname.match(/\/video\/(\d+)/)||[])[1] },
  r => res(r)))
```
Expected: 返回 `{ ok:true, awemeId, desc, author, video:{ bitRateAudioList:[…], playAddr } }`。
> 注：MCP `evaluate_script` 在 MAIN 世界，content-script 的 `chrome.runtime` 可能不可用；若此处取不到 `chrome`，改为在扩展 service worker 上下文或经内容脚本触发。核心验收是「桥返回 ok:true 且含 bitRateAudioList」，可在 Task 10 内容脚本就位后端到端复验。

- [ ] **Step 5: 提交**

```bash
git add src/background.ts
git commit -m "feat(douyin): background MAIN-world bridge to read player + seek

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `playerBridge` 模块（消息封装 + awemeInfo 缓存）

**Files:**
- Create: `src/services/platform/douyin/playerBridge.ts`

- [ ] **Step 1: 实现**

`src/services/platform/douyin/playerBridge.ts`:
```ts
import { pickAudioStreams, type DouyinVideoData } from "./audioStreams"

export interface CachedAweme {
    id: string
    title: string
    author: string
    coverUrl: string
    audioStreams: string[]
}

// One active video per tab → module-level singleton cache.
let cached: CachedAweme | null = null

/** Synchronous read of the last-loaded aweme, only if it matches `id`. */
export function getCachedAweme(id: string): CachedAweme | null {
    return cached && cached.id === id ? cached : null
}

interface ReadPlayerResponse {
    ok: boolean
    awemeId?: string
    desc?: string
    author?: string
    cover?: string
    video?: DouyinVideoData
    reason?: string
}

/**
 * Ask the background SW to read window.player.config.awemeInfo (MAIN world)
 * and cache the normalized result for synchronous reads by DouyinService.
 */
export async function loadAweme(id: string): Promise<CachedAweme | null> {
    try {
        const res: ReadPlayerResponse = await chrome.runtime.sendMessage({
            type: "READ_DOUYIN_PLAYER",
            videoId: id
        })
        if (!res?.ok || res.awemeId !== id) {
            console.warn("[DouyinBridge] readPlayer failed:", res?.reason)
            return null
        }
        cached = {
            id,
            title: (res.desc || "").split("\n")[0].trim() || "Unknown Title",
            author: res.author || "Unknown Author",
            coverUrl: res.cover || "",
            audioStreams: pickAudioStreams(res.video),
        }
        return cached
    } catch (e) {
        console.error("[DouyinBridge] loadAweme error:", e)
        return null
    }
}

/** Ask the SW to call window.player.seek() in MAIN world. */
export function douyinSeek(seconds: number): void {
    chrome.runtime.sendMessage({ type: "DOUYIN_PLAYER_SEEK", seconds }).catch(() => {})
}
```

- [ ] **Step 2: 确认编译无类型错误**

Run: `pnpm build 2>&1 | tail -5`
Expected: 无 TS 报错（或仅与本任务无关的既有警告）。
> 注：`pnpm build` 仅此处做一次性类型校验；日常调试不要调用 build（见 ARCHITECTURE §8.4），改用常驻 `pnpm dev`。

- [ ] **Step 3: 提交**

```bash
git add src/services/platform/douyin/playerBridge.ts
git commit -m "feat(douyin): playerBridge with module cache + seek messaging

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `DouyinService`（IPlatformService 实现）

**Files:**
- Create: `src/services/platform/douyin/DouyinService.ts`

- [ ] **Step 1: 实现**

`src/services/platform/douyin/DouyinService.ts`:
```ts
import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../types"
import { extractAwemeId } from "./awemeId"
import { getCachedAweme, loadAweme, douyinSeek } from "./playerBridge"

export class DouyinService implements IPlatformService {
    getPlatformName(): string {
        return "douyin"
    }

    // id 来自 URL（始终可得）；标题/作者/封面来自 player 缓存（异步桥填充，见 Task 10）；
    // 时长来自 <video> 元素（同步、可靠）。
    detectVideo(): VideoInfo | null {
        const id = extractAwemeId(window.location.href)
        if (!id) return null
        const cached = getCachedAweme(id)
        const videoEl = document.querySelector("video")
        const dur = videoEl && !Number.isNaN(videoEl.duration) ? videoEl.duration : 0
        return {
            id,
            title: cached?.title || "Unknown Title",
            author: cached?.author || "Unknown Author",
            coverUrl: cached?.coverUrl || "",
            duration: dur,
        }
    }

    // 抖音无 CC：永远返回空 → SummaryPanel 自动显示「通过 ASR 总结」按钮。
    async getSubtitles(): Promise<SubtitleSegment[]> {
        return []
    }

    // 评论 DOM 抓取拆到 Plan 2；本计划返回空。
    async getComments(): Promise<SampledComments> {
        return { consensus: [], controversial: [] }
    }

    supportsDigitalASR(): boolean {
        return true
    }

    async getAudioUrlCandidates(videoId: string): Promise<string[]> {
        const aweme = getCachedAweme(videoId) || (await loadAweme(videoId))
        return aweme?.audioStreams ?? []
    }

    async getAudioUrl(videoId: string): Promise<string | null> {
        return (await this.getAudioUrlCandidates(videoId))[0] ?? null
    }

    seekTo(seconds: number): void {
        douyinSeek(seconds)
    }
}
```

- [ ] **Step 2: 确认编译无类型错误**

Run: `pnpm build 2>&1 | tail -5`
Expected: 无与本任务相关的 TS 报错。

- [ ] **Step 3: 提交**

```bash
git add src/services/platform/douyin/DouyinService.ts
git commit -m "feat(douyin): DouyinService implements IPlatformService

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `PlatformFactory` 增加 douyin 分支

**Files:**
- Modify: `src/services/platform/PlatformFactory.ts`

识别三种形态：路径含 `/video/{数字}` 或 URL 含 `modal_id` 参数（覆盖 jingxuan / user 弹窗）。

- [ ] **Step 1: 实现**

`src/services/platform/PlatformFactory.ts` 改为：
```ts
import { BilibiliService } from "./bilibili/BilibiliService"
import { YouTubeService } from "./youtube/YouTubeService"
import { DouyinService } from "./douyin/DouyinService"
import type { IPlatformService } from "./types"

export class PlatformFactory {
    static getService(url: string): IPlatformService | null {
        if (url.includes("bilibili.com/video")) {
            return new BilibiliService()
        }
        if (url.includes("youtube.com/watch")) {
            return new YouTubeService()
        }
        if (url.includes("douyin.com")) {
            try {
                const u = new URL(url)
                if (/\/video\/\d+/.test(u.pathname) || u.searchParams.has("modal_id")) {
                    return new DouyinService()
                }
            } catch {
                // ignore malformed URL
            }
        }
        return null
    }
}
```

- [ ] **Step 2: 确认编译无类型错误**

Run: `pnpm build 2>&1 | tail -5`
Expected: 无 TS 报错。

- [ ] **Step 3: 提交**

```bash
git add src/services/platform/PlatformFactory.ts
git commit -m "feat(douyin): PlatformFactory routes douyin video/modal pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `VideoProvider` / `Sidebar` 增加 `navKey`（支撑 SPA 重检测）

**Files:**
- Modify: `src/contexts/VideoContext.tsx`
- Modify: `src/components/Sidebar/index.tsx`

向后兼容：`navKey` 可选，youtube/bilibili 不传（`undefined`），行为不变。

- [ ] **Step 1: `VideoProvider` 加可选 prop 并入 effect 依赖**

在 `src/contexts/VideoContext.tsx`：

(a) 改接口：
```ts
interface VideoProviderProps {
    service: IPlatformService
    isOpen: boolean
    navKey?: string | number
    children: ReactNode
}
```

(b) 改函数签名：
```ts
export function VideoProvider({ service, isOpen, navKey, children }: VideoProviderProps) {
```

(c) 把检测 effect 的依赖数组（当前为 `[isOpen, service, videoInfo?.id]`）改为：
```ts
    }, [isOpen, service, videoInfo?.id, navKey])
```

- [ ] **Step 2: `Sidebar` 加可选 prop 并透传**

在 `src/components/Sidebar/index.tsx`：

(a) 改 `Props`：
```ts
interface Props {
    service: IPlatformService
    isOpen: boolean
    navKey?: string | number
    onClose: () => void
}
```

(b) 改 `Sidebar` 签名解构出 `navKey`：
```ts
export function Sidebar({ service, isOpen, navKey, onClose }: Props) {
```

(c) 把 `<VideoProvider service={service} isOpen={isOpen}>` 改为：
```tsx
                    <VideoProvider service={service} isOpen={isOpen} navKey={navKey}>
```

- [ ] **Step 3: 确认编译 + 既有平台未回归**

Run: `pnpm build 2>&1 | tail -5`
Expected: 无 TS 报错（youtube.tsx / bilibili.tsx 不传 navKey 仍合法，因其可选）。

- [ ] **Step 4: 提交**

```bash
git add src/contexts/VideoContext.tsx src/components/Sidebar/index.tsx
git commit -m "feat(sidebar): optional navKey to retrigger detection on SPA nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 抖音内容脚本 + SPA `modal_id` 监听

**Files:**
- Create: `src/contents/douyin.tsx`

参照 `src/contents/youtube.tsx` 的 Shadow DOM 挂载与 I18nProvider 包裹；新增 nav-watcher：检测到 `modal_id`/路径变化 → **先 await `loadAweme` 填充缓存**，再 `setNavKey` 触发 `VideoProvider` 重检测（保证 detectVideo 首次即拿到标题/音频）。

- [ ] **Step 1: 实现**

`src/contents/douyin.tsx`:
```tsx
import { useState, useEffect } from "react"
import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import cssText from "data-text:~style.css"

import { DouyinService } from "../services/platform/douyin/DouyinService"
import { extractAwemeId } from "../services/platform/douyin/awemeId"
import { loadAweme } from "../services/platform/douyin/playerBridge"
import { Sidebar } from "../components/Sidebar"
import { ToggleButton } from "../components/ToggleButton"
import { I18nProvider } from "../i18n/I18nProvider"

export const config: PlasmoCSConfig = {
    matches: ["https://www.douyin.com/*"],
    all_frames: false
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId: PlasmoGetShadowHostId = () => "video-assistant-douyin"

export const getShadowHostStyle = () => {
    const style = document.createElement("style")
    style.textContent = `
        #video-assistant-douyin {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
        }
        #video-assistant-douyin > * {
            pointer-events: auto !important;
        }
    `
    return style
}

const service = new DouyinService()

/** Watch modal_id / path changes (SPA swiper) and produce a navKey that
 *  changes only AFTER the player cache for the new video is populated. */
function useDouyinNavKey(): string {
    const [navKey, setNavKey] = useState("")
    useEffect(() => {
        let last = ""
        let disposed = false
        const tick = async () => {
            const id = extractAwemeId(location.href) || ""
            if (id === last) return
            if (!id) { last = ""; if (!disposed) setNavKey(""); return }
            last = id
            await loadAweme(id)          // populate cache BEFORE re-detect
            if (!disposed && last === id) setNavKey(id)
        }
        const origPush = history.pushState
        const origReplace = history.replaceState
        history.pushState = function (...a: any[]) { const r = origPush.apply(this, a as any); queueMicrotask(tick); return r }
        history.replaceState = function (...a: any[]) { const r = origReplace.apply(this, a as any); queueMicrotask(tick); return r }
        window.addEventListener("popstate", tick)
        const iv = setInterval(tick, 1000)   // fallback for any missed transitions
        tick()
        return () => {
            disposed = true
            history.pushState = origPush
            history.replaceState = origReplace
            window.removeEventListener("popstate", tick)
            clearInterval(iv)
        }
    }, [])
    return navKey
}

const DouyinCS = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isDark, setIsDark] = useState(true)   // 抖音网页版以深色为主
    const navKey = useDouyinNavKey()

    useEffect(() => {
        console.log("[VideoAssistant] Douyin content script mounted")
    }, [])

    return (
        <I18nProvider>
            <div className={isDark ? "dark" : ""} style={{ pointerEvents: "auto" }}>
                <ToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
                <Sidebar service={service} isOpen={isOpen} navKey={navKey} onClose={() => setIsOpen(false)} />
            </div>
        </I18nProvider>
    )
}

export default DouyinCS
```

- [ ] **Step 2: 确认编译落地**

Run:
```bash
pnpm build 2>&1 | tail -5
ls -lt build/chrome-mv3-dev/ | head
```
Expected: 无 TS 报错；dev 目录出现 `douyin.*.js`（watcher 已编译）。

- [ ] **Step 3: MCP 验证 — 内容脚本注入 + detectVideo + 桥取音频**

1. 重载插件（new_page options.html → `chrome.runtime.reload()`）。
2. 打开/刷新抖音视频页（三种形态各测一次：`/video/{id}`、`/jingxuan?modal_id=`、`/user/...?modal_id=`）。
3. `list_console_messages` 应见 `[VideoAssistant] Douyin content script mounted`。
4. 点击右下角浮动按钮（`take_screenshot` 确认侧边栏打开、Header 标题显示视频 desc 首行、非「Unknown Title」）。
5. 在抖音页 `evaluate_script` 验证音频候选可取（经内容脚本世界）：
```js
() => new Promise(res => chrome.runtime.sendMessage(
  { type: "READ_DOUYIN_PLAYER",
    videoId: new URL(location.href).searchParams.get("modal_id") || (location.pathname.match(/\/video\/(\d+)/)||[])[1] },
  r => res({ ok: r?.ok, audioCount: (r?.video?.bitRateAudioList||[]).length })))
```
Expected: `{ ok:true, audioCount:>=1 }`。

- [ ] **Step 4: 提交**

```bash
git add src/contents/douyin.tsx
git commit -m "feat(douyin): content script + modal_id SPA nav watcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: 端到端验证（音频下载 R1 + ASR 摘要 + 章节 seek + swiper 切换）

**Files:** 无（MCP 调试循环验证；对应可行性分析 §6.3 R1、实现方案 §6）

- [ ] **Step 1: R1 — 内容脚本上下文完整下载音频**

在抖音视频页（已打开侧边栏）`evaluate_script` 实测从 ISOLATED 内容脚本同款条件下载音频（验证带 Referer、拿到 MP4 而非验证码页）：
```js
async () => {
  const r = await fetch(window.player.config.awemeInfo.video.bitRateAudioList[0].urlList[0].src,
                        { credentials: "omit", headers: { Range: "bytes=0-65535" } })
  const b = new Uint8Array((await r.arrayBuffer()).slice(0,8))
  return { status: r.status, type: r.headers.get("content-type"),
           sig: [...b].map(x=>x.toString(16).padStart(2,"0")).join(" ") }
}
```
Expected: `status: 206`，`type: video/mp4`，`sig` 含 `66 74 79 70`（`ftyp`，合法 MP4），**不是** `text/html`。
> 若返回 HTML（验证码页）：说明 ISOLATED fetch 未带正确 Referer/凭据。回退方案：改在 background worker 下载并设置 `Referer: https://www.douyin.com/`（参照 background `handleFetch` 模式）。这是本计划唯一的关键不确定点。

- [ ] **Step 2: 跑通 ASR 摘要 + 章节**

1. 在侧边栏 Summary Tab 点击「通过 ASR 总结」按钮。
2. 观察状态机推进（`getting_url → downloading → transcribing → summarizing`）；`list_console_messages` 看 `[useSummary] Audio downloaded: X MB` 与转写分块日志。
3. 等待生成完成，摘要出现 oneLiner + chapters（带时间戳）。

Expected: 生成结构化摘要，章节列表带 `[MM:SS]` 时间戳。

- [ ] **Step 3: 验证章节 seek**

点击任一章节时间戳。
Expected: 抖音播放器跳转到对应秒数并播放（`window.player.seek()` 经桥生效）；`evaluate_script: () => window.player.currentTime` 约等于该章节秒数。

- [ ] **Step 4: 验证思维导图 / AskAI 复用**

1. 切到 MindMap Tab：基于 ASR 文本自动生成思维导图（SVG 渲染）。
2. 切到 Ask AI Tab：提问与视频内容相关的问题，回答应引用转写内容。

Expected: 两者均正常（复用既有 hook，零额外开发）。

- [ ] **Step 5: 验证 swiper 切换重置（D3）**

在精选/主页弹窗形态下，滑动到下一条视频（或改 URL modal_id）。
Expected: 侧边栏标题更新为新视频 desc；Summary 回到「通过 ASR 总结」初始态（不自动跑 ASR）；`evaluate_script` 确认 `service` 检测到新 awemeId。缓存键隔离正确（`douyin:{newId}:*`）。

- [ ] **Step 6: 跑全量单测 + 类型检查，确认无回归**

Run:
```bash
pnpm test
pnpm build 2>&1 | tail -5
```
Expected: 所有单测 PASS；build 无 TS 报错。

- [ ] **Step 7: 提交验证记录（如有微调）**

若 Step 1~5 过程中对实现有微调，逐项 `git add` 改动文件并提交：
```bash
git commit -am "fix(douyin): adjustments from e2e verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
（若无改动则跳过。）

---

## 收尾 / 后续

- 本计划完成后，抖音核心 ASR 摘要链路可用（摘要 / 章节 / 思维导图 / AskAI），三种页面形态 + swiper 切换均覆盖。
- **Plan 2（评论舆情）**：实现 `commentScraper.ts`（DOM 抓 `[data-e2e="comment-item"]` → `Comment[]` → `commentSampling`），替换 `DouyinService.getComments` 的空实现。需先用 MCP 实地探明评论条目的 DOM 结构（用户名/正文/点赞/回复数子节点）再写具体选择器与 `parseDouyinStat` 纯函数。
- 合并前用 `superpowers:finishing-a-development-branch` 决定 merge / PR。

---

## Self-Review

- **Spec 覆盖**：平台识别(Task 8)、detectVideo/URL+缓存(Task 7+10)、音频候选(Task 3+6+7)、MAIN 桥(Task 5+6)、seekTo(Task 5+6+7)、ASR 主链路复用(既有 useSummary + Task 7 的 getAudioUrlCandidates + Task 11 验证)、SPA 切换(Task 9+10)、导出 URL(Task 4)、思维导图/AskAI(复用，Task 11 验证)。评论按范围边界明确拆到 Plan 2。✅
- **占位符扫描**：无 TODO/TBD；DOM 选择器未知的评论部分整体拆出，未写猜测代码。✅
- **类型一致性**：`extractAwemeId`/`pickAudioStreams`/`DouyinVideoData`/`CachedAweme`/`loadAweme`/`getCachedAweme`/`douyinSeek` 跨 Task 命名一致；消息类型 `READ_DOUYIN_PLAYER`/`DOUYIN_PLAYER_SEEK` 在 background(Task 5) 与 playerBridge(Task 6) 一致；`navKey` 在 VideoContext/Sidebar/douyin.tsx 一致。✅
