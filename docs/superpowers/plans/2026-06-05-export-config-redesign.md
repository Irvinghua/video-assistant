# 知识导出配置重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构「知识导出」设置（目标下拉 + 条件配置 + 导出结构四选一，永久存储）与 sidebar 导出行为（按结构导出、缺失章节自动补生成、未配置目标时打开设置页）。

**Architecture:** 抽出 mindmap 生成纯函数供 hook 与导出共用；新增 `exportStructure` 映射与 `ExportContentProvider.ensureSections`（结构驱动 + 按需补生成 + 缓存，依赖注入可单测）；改造设置页与 `ExportMenu`。

**Tech Stack:** TypeScript、Plasmo、React、@plasmohq/storage、vitest、现有 `cacheService` / `AIServiceFactory` / `VideoSummarizer` / `CommentAnalyzer`。

**参考规范：** `docs/superpowers/specs/2026-06-05-export-config-redesign-design.md`

**关键既有事实（照此对接，勿臆测）：**
- 生成服务：`new VideoSummarizer().summarize(subtitles: SubtitleSegment[], language)`、`new CommentAnalyzer().analyze(sampled: SampledComments, script: string, language?)`，均在 `src/services/summarizer/`。
- mindmap 生成逻辑当前内联在 `src/hooks/useMindMap.ts` 的 `generateFromScript`（约 74–90 行）：`AIServiceFactory.getService()` → `chunkText(script,3000)` → 多块时 `Prompts.mindmapChunkSummary` 汇总 → `Prompts.mindmap` → 去 ```` ``` ```` 包裹。
- `getPlainScript(platform, videoId): Promise<string|null>`（`src/services/cache/SubtitleScript.ts`，无缓存字幕时返回 null）。
- `cacheService.get<T>(key): Promise<T|null>`、`cacheService.set(key, data, ttl=DEFAULT_TTL=3天)`；`cacheKeys.{summary,comments,mindmap}(platform, videoId)`（`src/services/cache/CacheService.ts`）。
- `SampledComments = { consensus: [], controversial: [] }`（`src/services/platform/types.ts`）。
- `useI18n()` 返回 `{ t, aiLanguage, ... }`（mindmap/comment hook 在用）。`VideoContext` 暴露 `platform`、`videoInfo`、`subtitles`、`sampledComments`。
- 打开设置页：`chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" })`（`background.ts` 已有 handler）。
- 设置页 `<select>` 样式参考 `src/options.tsx:305`：`className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 ... outline-none"`。
- `@plasmohq/storage` 的 `new Storage()` = `chrome.storage.local`，**永久无 TTL**（配置用它）。
- **构建规则**：不要跑 `pnpm dev`/`pnpm build`；`pnpm test <path>` 与 `npx tsc --noEmit -p tsconfig.json` 可用；UI 验证走 MCP reload。

---

## File Structure

**新建：**
- `src/services/summarizer/MindmapGenerator.ts` — `generateMindmapMarkdown(script, language, service?)`（从 useMindMap 抽取）
- `src/services/export/exportStructure.ts` — `ExportStructure` 类型 + `structureToSections`（纯）
- `src/services/export/ExportContentProvider.ts` — `ensureSections` + 默认 deps
- 对应 `*.test.ts`

**修改：**
- `src/hooks/useMindMap.ts` — 改用 `generateMindmapMarkdown`（DRY）
- `src/i18n/locales/*.json`（10）— 新增导出目标/结构与 toast key
- `src/options.tsx` — 「知识导出」区：目标下拉 + 条件配置 + 结构下拉；load/save 新 key
- `src/components/Sidebar/ExportMenu.tsx` — 结构驱动 + 自动补生成 + 未配置打开设置页

---

## Task 1: 抽取 MindmapGenerator

**Files:**
- Create: `src/services/summarizer/MindmapGenerator.ts`
- Test: `src/services/summarizer/MindmapGenerator.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest"
import { generateMindmapMarkdown } from "./MindmapGenerator"
import type { IAIService } from "../ai/types"

function fakeService(reply: string): IAIService {
  return {
    summarize: vi.fn(),
    analyzeComments: vi.fn(),
    chat: vi.fn(async () => reply),
    getModelName: () => "fake"
  }
}

describe("generateMindmapMarkdown", () => {
  it("strips ``` fences and trims", async () => {
    const svc = fakeService("```markdown\n# 根\n- 枝\n```")
    const md = await generateMindmapMarkdown("短脚本", "Chinese", svc)
    expect(md).toBe("# 根\n- 枝")
  })

  it("passes the script through the mindmap prompt for short input (single chunk)", async () => {
    const svc = fakeService("# T")
    await generateMindmapMarkdown("hello", "English", svc)
    // single chunk → only one chat call (the final mindmap prompt)
    expect((svc.chat as any).mock.calls.length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/summarizer/MindmapGenerator.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `src/services/summarizer/MindmapGenerator.ts`:

```ts
import { AIServiceFactory } from "../ai/AIServiceFactory"
import { Prompts } from "../ai/prompts"
import { chunkText } from "../../utils/textChunker"
import type { IAIService } from "../ai/types"

/**
 * Generate mind-map markdown from a transcript/script. Extracted from
 * useMindMap so both the hook and the export pipeline share one implementation.
 * `service` is injectable for testing; defaults to the configured AI service.
 */
export async function generateMindmapMarkdown(
  script: string,
  language: string,
  service?: IAIService
): Promise<string> {
  const aiService = service ?? (await AIServiceFactory.getService())
  const chunks = chunkText(script, 3000)
  let combinedText = script
  if (chunks.length > 1) {
    const summaries = await Promise.all(
      chunks.map(chunk =>
        aiService.chat([{ role: "user", content: Prompts.mindmapChunkSummary(chunk, language) }])
      )
    )
    combinedText = summaries.join("\n\n")
  }
  const result = await aiService.chat([{ role: "user", content: Prompts.mindmap(combinedText, language) }])
  return result.replace(/^```(?:markdown)?\n?/m, "").replace(/\n?```$/m, "").trim()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/summarizer/MindmapGenerator.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/services/summarizer/MindmapGenerator.ts src/services/summarizer/MindmapGenerator.test.ts
git commit -m "feat(mindmap): extract generateMindmapMarkdown for reuse"
```

---

## Task 2: useMindMap 改用 MindmapGenerator（DRY）

**Files:**
- Modify: `src/hooks/useMindMap.ts`

- [ ] **Step 1: 替换 generateFromScript 内联逻辑**

读 `src/hooks/useMindMap.ts`。把 `generateFromScript`（约 69–98 行）改为：

```ts
  const generateFromScript = async (script: string) => {
    if (!videoId) return
    setLoading(true)
    setError("")
    try {
      const cleaned = await generateMindmapMarkdown(script, aiLanguage)
      if (currentVideoIdRef.current !== videoId) return
      setMarkdown(cleaned)
      await cacheService.set(cacheKeys.mindmap(platform, videoId), cleaned)
      console.log(`[useMindMap] Generated and cached mindmap for ${videoId}`)
    } catch (e) {
      setError((e as Error).message)
      console.error("[useMindMap] Generation error:", e)
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 2: 修正 imports**

在顶部加：`import { generateMindmapMarkdown } from "../services/summarizer/MindmapGenerator"`。
删除现在不再使用的导入：`AIServiceFactory`（第 2 行）、`Prompts`（第 6 行）、`chunkText`（第 7 行）。**保留** `transcribeLongAudio`、`cacheService`/`cacheKeys`、`getPlainScript`、其余。

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i usemindmap || echo CLEAN`
Expected: CLEAN（无未用导入残留报错；本项目 strict:false 不会因未用变量报错，但仍应删干净）。

- [ ] **Step 4: 提交**

```bash
git add src/hooks/useMindMap.ts
git commit -m "refactor(mindmap): use shared generateMindmapMarkdown in hook"
```

---

## Task 3: exportStructure 映射（纯）

**Files:**
- Create: `src/services/export/exportStructure.ts`
- Test: `src/services/export/exportStructure.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest"
import { structureToSections, EXPORT_STRUCTURES, type ExportStructure } from "./exportStructure"

describe("structureToSections", () => {
  it("maps each structure to its section set", () => {
    expect([...structureToSections("summary")]).toEqual(["summary"])
    expect([...structureToSections("summary_comments")].sort()).toEqual(["comments", "summary"])
    expect([...structureToSections("summary_mindmap")].sort()).toEqual(["mindmap", "summary"])
    expect([...structureToSections("summary_comments_mindmap")].sort()).toEqual(["comments", "mindmap", "summary"])
  })

  it("falls back to summary-only for unknown values", () => {
    expect([...structureToSections("bogus" as ExportStructure)]).toEqual(["summary"])
  })

  it("lists all four structures in order", () => {
    expect(EXPORT_STRUCTURES).toEqual([
      "summary", "summary_comments", "summary_mindmap", "summary_comments_mindmap"
    ])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/exportStructure.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/exportStructure.ts`:

```ts
export type Section = "summary" | "comments" | "mindmap"

export type ExportStructure =
  | "summary"
  | "summary_comments"
  | "summary_mindmap"
  | "summary_comments_mindmap"

export const EXPORT_STRUCTURES: ExportStructure[] = [
  "summary",
  "summary_comments",
  "summary_mindmap",
  "summary_comments_mindmap"
]

const MAP: Record<ExportStructure, Section[]> = {
  summary: ["summary"],
  summary_comments: ["summary", "comments"],
  summary_mindmap: ["summary", "mindmap"],
  summary_comments_mindmap: ["summary", "comments", "mindmap"]
}

export function structureToSections(structure: ExportStructure): Set<Section> {
  return new Set(MAP[structure] ?? MAP.summary)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/exportStructure.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/exportStructure.ts src/services/export/exportStructure.test.ts
git commit -m "feat(export): add export structure → section mapping"
```

---

## Task 4: ExportContentProvider.ensureSections

**Files:**
- Create: `src/services/export/ExportContentProvider.ts`
- Test: `src/services/export/ExportContentProvider.test.ts`

按选定章节集合，逐章节：命中缓存即用；未命中且前置可用则生成并缓存；前置缺失则列入 `missing`（不静默 ASR）。依赖注入便于单测。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest"
import { ensureSections, type EnsureDeps } from "./ExportContentProvider"
import type { SummaryResult, CommentAnalysis } from "../ai/types"

const summary: SummaryResult = { oneLiner: "x", chapters: [], fullDigest: "y" }
const comments: CommentAnalysis = { consensus: [], divergences: [], gap: { hit: "", miss: "" }, mood: [], spotlight: [] }

function makeDeps(over: Partial<EnsureDeps> = {}): EnsureDeps {
  return {
    getCached: vi.fn(async () => null),
    setCached: vi.fn(async () => {}),
    getScript: vi.fn(async () => "script text"),
    genSummary: vi.fn(async () => summary),
    genComments: vi.fn(async () => comments),
    genMindmap: vi.fn(async () => "# mm"),
    ...over
  }
}

const inputs = {
  platform: "bilibili",
  videoId: "BV1",
  language: "Chinese",
  subtitles: [{ text: "a", start: 0, end: 1 }],
  sampledComments: { consensus: [{ text: "c", likes: 9 } as any], controversial: [] }
}

it("uses cached section without regenerating", async () => {
  const deps = makeDeps({ getCached: vi.fn(async () => summary) })
  const r = await ensureSections(new Set(["summary"]), inputs, deps)
  expect(r.summary).toBe(summary)
  expect(deps.genSummary).not.toHaveBeenCalled()
  expect(r.missing).toEqual([])
})

it("generates and caches a missing section when prerequisites are available", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["summary", "mindmap"]), inputs, deps)
  expect(deps.genSummary).toHaveBeenCalledOnce()
  expect(deps.genMindmap).toHaveBeenCalledOnce()
  expect(deps.setCached).toHaveBeenCalledTimes(2)
  expect(r.summary).toBe(summary)
  expect(r.mindmap).toBe("# mm")
})

it("marks summary missing (no silent ASR) when there are no subtitles", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["summary"]), { ...inputs, subtitles: [] }, deps)
  expect(deps.genSummary).not.toHaveBeenCalled()
  expect(r.summary).toBeNull()
  expect(r.missing).toEqual(["summary"])
})

it("marks comments missing when there are no sampled comments", async () => {
  const deps = makeDeps()
  const r = await ensureSections(new Set(["comments"]), { ...inputs, sampledComments: { consensus: [], controversial: [] } }, deps)
  expect(deps.genComments).not.toHaveBeenCalled()
  expect(r.missing).toEqual(["comments"])
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/ExportContentProvider.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/ExportContentProvider.ts`:

```ts
import { cacheService, cacheKeys } from "../cache/CacheService"
import { getPlainScript } from "../cache/SubtitleScript"
import { VideoSummarizer } from "../summarizer/VideoSummarizer"
import { CommentAnalyzer } from "../summarizer/CommentAnalyzer"
import { generateMindmapMarkdown } from "../summarizer/MindmapGenerator"
import type { SummaryResult, CommentAnalysis } from "../ai/types"
import type { SubtitleSegment, SampledComments } from "../platform/types"
import type { Section } from "./exportStructure"

export interface SectionInputs {
  platform: string
  videoId: string
  language: string
  subtitles: SubtitleSegment[]
  sampledComments: SampledComments | null
}

export interface EnsureResult {
  summary: SummaryResult | null
  comments: CommentAnalysis | null
  mindmap: string | null
  missing: Section[]
}

export interface EnsureDeps {
  getCached: <T>(key: string) => Promise<T | null>
  setCached: <T>(key: string, val: T) => Promise<void>
  getScript: (platform: string, videoId: string) => Promise<string | null>
  genSummary: (subs: SubtitleSegment[], lang: string) => Promise<SummaryResult>
  genComments: (sampled: SampledComments, script: string, lang: string) => Promise<CommentAnalysis>
  genMindmap: (script: string, lang: string) => Promise<string>
}

const defaultDeps: EnsureDeps = {
  getCached: (k) => cacheService.get(k),
  setCached: (k, v) => cacheService.set(k, v),
  getScript: getPlainScript,
  genSummary: (subs, lang) => new VideoSummarizer().summarize(subs, lang),
  genComments: (sampled, script, lang) => new CommentAnalyzer().analyze(sampled, script, lang),
  genMindmap: (script, lang) => generateMindmapMarkdown(script, lang)
}

export async function ensureSections(
  sections: Set<Section>,
  inputs: SectionInputs,
  deps: EnsureDeps = defaultDeps
): Promise<EnsureResult> {
  const { platform, videoId, language, subtitles, sampledComments } = inputs
  const result: EnsureResult = { summary: null, comments: null, mindmap: null, missing: [] }

  // comments/mindmap need a plain-text script: cached subtitles → in-memory fallback
  let script: string | null = null
  if (sections.has("comments") || sections.has("mindmap")) {
    script = await deps.getScript(platform, videoId)
    if (!script && subtitles.length) script = subtitles.map(s => s.text).join("\n")
  }

  if (sections.has("summary")) {
    const key = cacheKeys.summary(platform, videoId)
    let s = await deps.getCached<SummaryResult>(key)
    if (!s) {
      if (subtitles.length) {
        s = await deps.genSummary(subtitles, language)
        await deps.setCached(key, s)
      } else {
        result.missing.push("summary")
      }
    }
    result.summary = s
  }

  if (sections.has("comments")) {
    const key = cacheKeys.comments(platform, videoId)
    let c = await deps.getCached<CommentAnalysis>(key)
    if (!c) {
      const hasSamples = !!sampledComments &&
        sampledComments.consensus.length + sampledComments.controversial.length > 0
      if (hasSamples && script) {
        c = await deps.genComments(sampledComments as SampledComments, script, language)
        await deps.setCached(key, c)
      } else {
        result.missing.push("comments")
      }
    }
    result.comments = c
  }

  if (sections.has("mindmap")) {
    const key = cacheKeys.mindmap(platform, videoId)
    let m = await deps.getCached<string>(key)
    if (!m) {
      if (script) {
        m = await deps.genMindmap(script, language)
        await deps.setCached(key, m)
      } else {
        result.missing.push("mindmap")
      }
    }
    result.mindmap = m
  }

  return result
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/ExportContentProvider.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/ExportContentProvider.ts src/services/export/ExportContentProvider.test.ts
git commit -m "feat(export): add ExportContentProvider.ensureSections"
```

---

## Task 5: i18n 新增 key（10 locale）

**Files:**
- Modify: `src/i18n/locales/{zh-CN,en,ja,ko,fr,es,pt,id,hi,ar}.json`

zh-CN/en 用实译，其余 8 个用 en 占位。每个文件：在 `options.labels` 加 `exportTarget`、`exportStructure`；新增顶层 `exportTargets`、`exportStructures`；在 `exportMenu` 加 `generating`、`partialMissing`、`needAiConfig`。

- [ ] **Step 1: zh-CN**

`options.labels` 加：
```json
"exportTarget": "导出目标",
"exportStructure": "导出结构"
```
顶层加：
```json
"exportTargets": { "notion": "Notion", "obsidian": "Obsidian" },
"exportStructures": {
  "summary": "仅视频总结",
  "summary_comments": "视频总结 + 评论总结",
  "summary_mindmap": "视频总结 + 思维导图",
  "summary_comments_mindmap": "视频总结 + 评论总结 + 思维导图"
}
```
`exportMenu` 加：
```json
"generating": "正在生成缺失章节…",
"partialMissing": "部分章节缺少字幕或评论无法生成，已导出其余",
"needAiConfig": "请先在设置中配置 AI 模型 / API Key"
```

- [ ] **Step 2: en**

`options.labels` 加：
```json
"exportTarget": "Export Target",
"exportStructure": "Export Structure"
```
顶层加：
```json
"exportTargets": { "notion": "Notion", "obsidian": "Obsidian" },
"exportStructures": {
  "summary": "Summary only",
  "summary_comments": "Summary + Comments",
  "summary_mindmap": "Summary + Mind map",
  "summary_comments_mindmap": "Summary + Comments + Mind map"
}
```
`exportMenu` 加：
```json
"generating": "Generating missing sections…",
"partialMissing": "Some sections lack subtitles/comments and were skipped; exported the rest",
"needAiConfig": "Configure an AI model / API key in Settings first"
```

- [ ] **Step 3: 其余 8 个 locale**

对 `ja, ko, fr, es, pt, id, hi, ar`：加入与 en 相同 key 结构（`options.labels.exportTarget/exportStructure`、顶层 `exportTargets`/`exportStructures`、`exportMenu.{generating,partialMissing,needAiConfig}`），**值用 en 文案占位**。

- [ ] **Step 4: 校验**

Run:
```bash
node -e '
const fs=require("fs"),d="src/i18n/locales/";let ok=true;
for(const f of fs.readdirSync(d).filter(f=>f.endsWith(".json"))){
  let j; try{ j=JSON.parse(fs.readFileSync(d+f,"utf8")); }catch(e){ console.log(f,"BAD",e.message); ok=false; continue; }
  const miss=[];
  for(const k of ["exportTarget","exportStructure"]) if(!j.options?.labels?.[k]) miss.push("labels."+k);
  if(!j.exportTargets?.notion) miss.push("exportTargets");
  for(const k of ["summary","summary_comments","summary_mindmap","summary_comments_mindmap"]) if(!j.exportStructures?.[k]) miss.push("exportStructures."+k);
  for(const k of ["generating","partialMissing","needAiConfig"]) if(!j.exportMenu?.[k]) miss.push("exportMenu."+k);
  console.log(f, miss.length?("FAIL "+miss.join(",")):"OK"); if(miss.length) ok=false;
}
process.exit(ok?0:1);
'
```
Expected: 每个文件 `OK`。

- [ ] **Step 5: 提交**

```bash
git add src/i18n/locales
git commit -m "i18n: add export target/structure labels and export toasts"
```

---

## Task 6: 设置页「知识导出」区重构

**Files:**
- Modify: `src/options.tsx`

把 Notion/Obsidian 四个输入框平铺，改为「导出目标下拉 → 条件渲染对应配置」+「导出结构下拉」。新增 `exportTarget`/`exportStructure` state 与 load/save。

- [ ] **Step 1: state**

读 `src/options.tsx`。在导出相关 state（`notionToken` 等）附近加：

```tsx
const [exportTarget, setExportTarget] = useState<"notion" | "obsidian">("notion")
const [exportStructure, setExportStructure] = useState("summary")
```

- [ ] **Step 2: load**

在加载逻辑里（读 `notionToken` 等的同段）加：

```tsx
const eTarget = (await storage.get("exportTarget")) || "notion"
const eStructure = (await storage.get("exportStructure")) || "summary"
// ...
setExportTarget(eTarget as "notion" | "obsidian")
setExportStructure(eStructure)
```

- [ ] **Step 3: save**

在 `handleSave` 里（保存 `notionToken` 等的同段）加：

```tsx
await storage.set("exportTarget", exportTarget)
await storage.set("exportStructure", exportStructure)
```

- [ ] **Step 4: 渲染**

把「知识导出」Section 里现有的 Notion Token / 父页面 ID / Obsidian Vault / 文件夹四个 `<div>` 输入块，替换为下面这段（保留 Section 外壳 `<section>...<h2>`）。引导文案沿用各 `t("options.placeholders.*")`。

```tsx
{/* 导出目标 */}
<div>
  <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.exportTarget")}</label>
  <select
    value={exportTarget}
    onChange={(e) => setExportTarget(e.target.value as "notion" | "obsidian")}
    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
  >
    <option value="notion">{t("options.exportTargets.notion")}</option>
    <option value="obsidian">{t("options.exportTargets.obsidian")}</option>
  </select>
</div>

{/* 条件配置：Notion */}
{exportTarget === "notion" && (
  <>
    <div>
      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.notionToken")}</label>
      <input type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)}
        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={t("options.placeholders.notionToken")} />
    </div>
    <div>
      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.notionParentPageId")}</label>
      <input type="text" value={notionParentPageId} onChange={(e) => setNotionParentPageId(e.target.value)}
        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={t("options.placeholders.notionParentPageId")} />
    </div>
  </>
)}

{/* 条件配置：Obsidian */}
{exportTarget === "obsidian" && (
  <>
    <div>
      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianVault")}</label>
      <input type="text" value={obsidianVault} onChange={(e) => setObsidianVault(e.target.value)}
        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={t("options.placeholders.obsidianVault")} />
    </div>
    <div>
      <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianFolder")}</label>
      <input type="text" value={obsidianFolder} onChange={(e) => setObsidianFolder(e.target.value)}
        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={t("options.placeholders.obsidianFolder")} />
    </div>
  </>
)}

{/* 导出结构 */}
<div>
  <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.exportStructure")}</label>
  <select
    value={exportStructure}
    onChange={(e) => setExportStructure(e.target.value)}
    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
  >
    <option value="summary">{t("options.exportStructures.summary")}</option>
    <option value="summary_comments">{t("options.exportStructures.summary_comments")}</option>
    <option value="summary_mindmap">{t("options.exportStructures.summary_mindmap")}</option>
    <option value="summary_comments_mindmap">{t("options.exportStructures.summary_comments_mindmap")}</option>
  </select>
</div>
```

注意：切换 `exportTarget` 只切换显示，**不清空** 另一目标已存的输入值（state 各自独立，load 时都从 storage 读，save 时都写——所以两组值都持久保留）。

- [ ] **Step 5: 验证编译并提交**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i options || echo CLEAN`
Expected: CLEAN。

```bash
git add src/options.tsx
git commit -m "feat(options): export target dropdown + conditional config + structure selector"
```

---

## Task 7: ExportMenu 结构驱动 + 自动补生成

**Files:**
- Modify: `src/components/Sidebar/ExportMenu.tsx`

未配置目标 → 打开设置页；按 `exportStructure` 经 `ensureSections` 补齐章节；只把结构选定章节传给 `buildNoteDocument`；按结果/缺失/错误弹 toast。

- [ ] **Step 1: 重写组件**

把 `src/components/Sidebar/ExportMenu.tsx` 整体替换为：

```tsx
import { useState } from "react"
import { Download } from "lucide-react"
import { Storage } from "@plasmohq/storage"
import { useVideo } from "../../contexts/VideoContext"
import { useI18n } from "../../i18n/I18nProvider"
import { ExportService, type TargetId } from "../../services/export/ExportService"
import { DownloadTarget } from "../../services/export/targets/DownloadTarget"
import { buildNoteDocument, type NoteLabels } from "../../services/export/NoteBuilder"
import { buildVideoUrl } from "../../services/export/buildVideoUrl"
import { ensureSections } from "../../services/export/ExportContentProvider"
import { structureToSections, type ExportStructure } from "../../services/export/exportStructure"

const storage = new Storage()

export function ExportMenu() {
  const { videoInfo, platform, subtitles, sampledComments } = useVideo()
  const { t, aiLanguage } = useI18n()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState("")

  const labels: NoteLabels = {
    summarySection: t("exportMenu.labels.summarySection"),
    commentsSection: t("exportMenu.labels.commentsSection"),
    mindmapSection: t("exportMenu.labels.mindmapSection"),
    oneLiner: t("exportMenu.labels.oneLiner"),
    keyPoints: t("exportMenu.labels.keyPoints"),
    fullDigest: t("exportMenu.labels.fullDigest"),
    consensus: t("exportMenu.labels.consensus"),
    divergences: t("exportMenu.labels.divergences"),
    gap: t("exportMenu.labels.gap"),
    gapHit: t("exportMenu.labels.gapHit"),
    gapMiss: t("exportMenu.labels.gapMiss"),
    mood: t("exportMenu.labels.mood"),
    spotlight: t("exportMenu.labels.spotlight"),
    source: "",
    author: "",
    exportedAt: ""
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 2500)
  }

  const handle = async (id: TargetId) => {
    setOpen(false)
    if (!videoInfo) {
      flash(t("exportMenu.empty"))
      return
    }

    // 1) 目标配置校验（Notion/Obsidian）：未配置 → 打开设置页
    let target = null
    if (id !== "download") {
      target = await ExportService.buildTarget(id)
      if (!target.isConfigured()) {
        chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" })
        flash(t("exportMenu.needConfig"))
        return
      }
    }

    // 2) 结构驱动 + 自动补生成
    const structure = ((await storage.get("exportStructure")) || "summary") as ExportStructure
    const sections = structureToSections(structure)
    flash(t("exportMenu.generating"))
    let ensured
    try {
      ensured = await ensureSections(sections, {
        platform,
        videoId: videoInfo.id,
        language: aiLanguage,
        subtitles,
        sampledComments
      })
    } catch (e) {
      console.error("[ExportMenu] generation failed:", e)
      flash(t("exportMenu.needAiConfig"))
      return
    }

    // 3) 只取结构选定且已生成的章节
    const summary = sections.has("summary") ? ensured.summary : null
    const comments = sections.has("comments") ? ensured.comments : null
    const mindmap = sections.has("mindmap") ? ensured.mindmap : null
    if (!summary && !comments && !mindmap) {
      flash(t("exportMenu.empty"))
      return
    }

    const doc = buildNoteDocument({
      title: videoInfo.title,
      sourceUrl: buildVideoUrl(platform, videoInfo.id),
      platform,
      author: videoInfo.author,
      exportedAt: new Date().toISOString().slice(0, 10),
      summary,
      comments,
      mindmap,
      labels
    })

    // 4) 导出
    try {
      const result = id === "download" ? await new DownloadTarget().export(doc) : await target!.export(doc)
      if (ensured.missing.length) {
        flash(t("exportMenu.partialMissing"))
      } else if (result.kind === "invoked") {
        flash(t("exportMenu.obsidianInvoked"))
      } else if (result.kind === "fallback-download") {
        flash(t("exportMenu.fallbackDownloaded"))
      } else if (id === "notion") {
        flash(t("exportMenu.notionSuccess"))
      } else {
        flash(t("exportMenu.downloaded"))
      }
    } catch (e) {
      const code = (e as Error).message
      if (code === "NOTION_UNAUTHORIZED") flash(t("exportMenu.errorUnauthorized"))
      else if (code === "NOTION_PARENT_NOT_FOUND") flash(t("exportMenu.errorParentNotFound"))
      else if (code === "NOTION_RATE_LIMITED") flash(t("exportMenu.errorRateLimited"))
      else flash(t("exportMenu.errorGeneric"))
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
        title={t("exportMenu.button")}
      >
        <Download size={18} />
      </button>
      {open && (
        <div className="absolute end-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 text-sm">
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("notion")}>{t("exportMenu.toNotion")}</button>
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("obsidian")}>{t("exportMenu.toObsidian")}</button>
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("download")}>{t("exportMenu.download")}</button>
        </div>
      )}
      {toast && (
        <div className="absolute end-0 top-9 whitespace-nowrap px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-50">{toast}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i exportmenu || echo CLEAN`
Expected: CLEAN。

- [ ] **Step 3: 提交**

```bash
git add src/components/Sidebar/ExportMenu.tsx
git commit -m "feat(sidebar): structure-driven export with auto-generation and settings prompt"
```

---

## Task 8: 全量测试 + 真机验证

**Files:** 无（验证）

- [ ] **Step 1: 全量单测 + tsc**

Run: `pnpm test && npx tsc --noEmit -p tsconfig.json`
Expected: 全部 PASS，tsc 无输出。

- [ ] **Step 2: 确认增量编译**

Run: `ls -lt build/chrome-mv3-dev/bilibili.*.js build/chrome-mv3-dev/options.*.js 2>/dev/null | head`
Expected: mtime 为最近（常驻 watcher 已编译）。

- [ ] **Step 3: MCP reload + 走查**

reload 扩展（manifest 未变，但 options/content 改了——刷新设置页与视频页）后验证：
1. 设置页：导出目标切 Notion/Obsidian → 显示对应两输入；导出结构四选一可保存；刷新后保留（永久）。
2. 视频页：未配置目标时点「导入到 Notion/Obsidian」→ 新 tab 打开设置页 + toast「请先配置」。
3. 配置好 + 选「仅总结」→ 导出只含总结；选「总结+评论+脑图」但只生成了总结 → 自动补生成评论/脑图（有字幕+评论样本时），导出三节；无字幕→toast「部分章节…已导出其余」。
4. 下载 .md 同样按结构。

- [ ] **Step 4: 收尾提交（如有手动调整）**

```bash
git add -A && git commit -m "test: verify export-config redesign end-to-end"
```

---

## Self-Review 记录

- **Spec 覆盖**：§3 配置模型→Task 5/6；§4 设置页→Task 6；§5 sidebar→Task 7；§6 ensureSections→Task 3/4（+ mindmap 抽取 Task 1/2）；§7 NoteBuilder 过滤→Task 7（按结构传参，NoteBuilder 不改）；§8 i18n→Task 5；§9 错误→Task 7；§10 测试→各 Task + Task 8。✅
- **占位符**：无 TBD/TODO；代码步骤均含完整代码。✅
- **类型一致性**：`Section`/`ExportStructure`（Task 3）贯穿 Task 4/7；`EnsureDeps`/`ensureSections`（Task 4）签名与 Task 7 调用一致；`generateMindmapMarkdown`（Task 1）签名与 Task 2/4 一致；`ExportService.buildTarget`/`DownloadTarget.export`（既有）与 Task 7 一致；i18n key（Task 5）与 Task 6/7 引用一致。✅
- **ASR 边界**：ensureSections 对无字幕/无评论样本只列入 `missing`，绝不触发 ASR；Task 7 据此提示并导其余。✅
