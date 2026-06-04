# Notion / Obsidian 一键导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把视频总结、评论分析、思维导图一键导出到 Notion（token 粘贴）和 Obsidian（`obsidian://new`），并移除 Readwise。

**Architecture:** 抓取层与导出层解耦。三类已标准化数据 → `NoteBuilder` 生成结构化 `NoteDocument` → 两个渲染器（`toMarkdown` / `toNotionBlocks`）→ 多个 `ExportTarget` 适配器（Notion / Obsidian / 下载）。所有纯逻辑用 vitest 做 TDD；UI 与协议副作用隔离在薄壳里，核心决策（URI 构造、长度回退、Notion 请求体）抽成纯函数单测。

**Tech Stack:** TypeScript、Plasmo、React、@plasmohq/storage、vitest（新增）、Notion REST API、`obsidian://` URI、background `FETCH_API` 代理。

**参考规范：** `docs/superpowers/specs/2026-06-04-notion-obsidian-export-design.md`

**关键既有事实（实现时不要假设，照此对接）：**
- `VideoInfo = { id, title, author, coverUrl, duration }` —— **没有 url/platform 字段**。视频 URL 由 platform + id 构造。
- `VideoContext` 暴露 `platform`（值为 `"youtube"` / `"bilibili"`）、`videoInfo`、`cachedData: { summary, comments, mindmap, sampledComments }`。导出入口从这里一把取齐三类内容。
- `SummaryResult = { oneLiner, chapters:[{timestamp,title,summary}], fullDigest }`
- `CommentAnalysis = { consensus:[{point,heat}], divergences:[{topic,sideA,sideB,rootCause}], gap:{hit,miss}, mood:string[], spotlight:string[] }`
- 思维导图是一段 Markdown 字符串，用 `#/##/###/-` 分层。
- 跨域请求必须走 background `FETCH_API`（Notion API 无 CORS）。POST 范式见 `src/services/ai/OllamaService.ts:28`。
- i18n key：`options.labels.{notionToken,readwiseToken,obsidianVault}`、`options.placeholders.{notionToken,obsidianVault}`、`options.sections.export`，10 个 locale 文件在 `src/i18n/locales/`。
- 构建规则（见用户记忆）：**不要运行 `pnpm dev`/`pnpm build`**；改完用 `ls -lt build/chrome-mv3-dev/` 验证；通过 chrome-devtools MCP reload。`pnpm test` 是新加的，可正常运行。

---

## File Structure

**新建：**
- `vitest.config.ts` — 测试配置
- `src/services/export/NoteDocument.ts` — 中间表示类型
- `src/services/export/parseMindmap.ts` — 思维导图 Markdown → bullet 树（纯）
- `src/services/export/sanitizeFilename.ts` — 文件名/路径清洗（纯）
- `src/services/export/buildVideoUrl.ts` — platform + id → 视频 URL（纯）
- `src/services/export/NoteBuilder.ts` — 三类数据 → `NoteDocument`（纯）
- `src/services/export/renderers/toMarkdown.ts` — `NoteDocument` → Markdown（纯）
- `src/services/export/renderers/toNotionBlocks.ts` — `NoteDocument` → Notion block[]（纯）
- `src/services/export/fetchProxy.ts` — background FETCH_API 封装 + 类型
- `src/services/export/NotionClient.ts` — 接口 + `TokenNotionClient`
- `src/services/export/targets/ExportTarget.ts` — 接口 + `ExportResult`
- `src/services/export/targets/NotionTarget.ts`
- `src/services/export/targets/ObsidianTarget.ts` — 含纯函数 `buildObsidianRequest`
- `src/services/export/targets/DownloadTarget.ts`
- `src/components/Sidebar/ExportMenu.tsx` — 导出下拉入口
- 测试：与被测文件同目录 `*.test.ts`

**修改：**
- `package.json` — 加 vitest devDep 与 `test` 脚本
- `src/background.ts:226-239` — `FETCH_API` 响应附带 `status`
- `src/services/export/ExportService.ts` — 改为编排器（保留旧静态方法向后兼容）
- `src/options.tsx` — 删 Readwise，加 Notion 父页面 ID、Obsidian vault 名 + 文件夹
- `src/i18n/locales/*.json`（10 个）— 删 readwise key，加新 key
- `src/components/Sidebar/index.tsx:30-39` — header 加入 `ExportMenu`

---

## Task 1: 测试工具（vitest）

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/services/export/smoke.test.ts`（临时验证用，本任务末尾删除）

- [ ] **Step 1: 安装 vitest**

Run: `pnpm add -D vitest`
Expected: `vitest` 出现在 `package.json` 的 devDependencies。

- [ ] **Step 2: 加 test 脚本**

`package.json` 的 `scripts` 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 写 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
})
```

- [ ] **Step 4: 冒烟测试确认 runner 可用**

Create `src/services/export/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest"

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `pnpm test`
Expected: 1 passed。

- [ ] **Step 5: 删除冒烟测试并提交**

```bash
rm src/services/export/smoke.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: NoteDocument 类型

**Files:**
- Create: `src/services/export/NoteDocument.ts`

- [ ] **Step 1: 定义类型**

Create `src/services/export/NoteDocument.ts`:

```ts
export interface RichText {
  text: string
  bold?: boolean
}

export type NoteBlock =
  | { kind: "paragraph"; text: RichText[] }
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "bullet"; text: RichText[]; children?: NoteBlock[] }

export interface NoteSection {
  heading: string
  blocks: NoteBlock[]
}

export interface NoteMeta {
  sourceUrl: string
  platform: string
  author?: string
  exportedAt: string // YYYY-MM-DD
}

export interface NoteDocument {
  title: string
  meta: NoteMeta
  sections: NoteSection[]
}
```

- [ ] **Step 2: 提交**

```bash
git add src/services/export/NoteDocument.ts
git commit -m "feat(export): add NoteDocument intermediate types"
```

---

## Task 3: buildVideoUrl（纯）

**Files:**
- Create: `src/services/export/buildVideoUrl.ts`
- Test: `src/services/export/buildVideoUrl.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/buildVideoUrl.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `src/services/export/buildVideoUrl.ts`:

```ts
export function buildVideoUrl(platform: string, videoId: string): string {
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${videoId}`
  if (platform === "bilibili") return `https://www.bilibili.com/video/${videoId}`
  return ""
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/buildVideoUrl.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/buildVideoUrl.ts src/services/export/buildVideoUrl.test.ts
git commit -m "feat(export): add buildVideoUrl"
```

---

## Task 4: sanitizeFilename（纯）

**Files:**
- Create: `src/services/export/sanitizeFilename.ts`
- Test: `src/services/export/sanitizeFilename.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/sanitizeFilename.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/sanitizeFilename.ts`:

```ts
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned.replace(/^-+|-+$/g, "").trim() || "untitled"
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/sanitizeFilename.test.ts`
Expected: PASS。

> 注：`"///"` → replace 得 `"---"` → trim 后非空，但末尾的 `replace(/^-+|-+$/g,"")` 去掉首尾 `-` 得 `""` → 回退 `"untitled"`。`'a/b...'` 各非法符变 `-`，无首尾 `-`，保留。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/sanitizeFilename.ts src/services/export/sanitizeFilename.test.ts
git commit -m "feat(export): add sanitizeFilename"
```

---

## Task 5: parseMindmap（纯）

**Files:**
- Create: `src/services/export/parseMindmap.ts`
- Test: `src/services/export/parseMindmap.test.ts`

将思维导图 Markdown（`#/##/###/-`）解析为 `NoteBlock` bullet 树。规则：标题 `#{n}` 深度 = n；列表项 `-`/`*` 深度 = 当前标题深度 + 1 + floor(前导空格/2)；用栈按深度建树。

- [ ] **Step 1: 写失败测试**

```ts
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
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/parseMindmap.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/parseMindmap.ts`:

```ts
import type { NoteBlock } from "./NoteDocument"

interface FlatNode {
  depth: number
  text: string
}

function flatten(md: string): FlatNode[] {
  const out: FlatNode[] = []
  let headingDepth = 0
  for (const raw of md.split("\n")) {
    if (!raw.trim()) continue
    const heading = raw.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      headingDepth = heading[1].length
      out.push({ depth: headingDepth, text: heading[2].trim() })
      continue
    }
    const list = raw.match(/^(\s*)[-*]\s+(.*)$/)
    if (list) {
      const indent = Math.floor(list[1].length / 2)
      out.push({ depth: headingDepth + 1 + indent, text: list[2].trim() })
      continue
    }
    out.push({ depth: headingDepth + 1, text: raw.trim() })
  }
  return out
}

export function parseMindmap(md: string): NoteBlock[] {
  const flat = flatten(md)
  const roots: NoteBlock[] = []
  const stack: { depth: number; node: Extract<NoteBlock, { kind: "bullet" }> }[] = []

  for (const { depth, text } of flat) {
    const node: Extract<NoteBlock, { kind: "bullet" }> = { kind: "bullet", text: [{ text }] }
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
    if (stack.length === 0) {
      roots.push(node)
    } else {
      const parent = stack[stack.length - 1].node
      ;(parent.children ||= []).push(node)
    }
    stack.push({ depth, node })
  }
  return roots
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/parseMindmap.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/parseMindmap.ts src/services/export/parseMindmap.test.ts
git commit -m "feat(export): add mindmap markdown parser"
```

---

## Task 6: NoteBuilder（纯）

**Files:**
- Create: `src/services/export/NoteBuilder.ts`
- Test: `src/services/export/NoteBuilder.test.ts`

把三类内容组装成 `NoteDocument`。缺失的内容跳过该分节。分节标题由调用方传入（已翻译），避免 NoteBuilder 依赖 i18n。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest"
import { buildNoteDocument } from "./NoteBuilder"
import type { SummaryResult, CommentAnalysis } from "../ai/types"

const summary: SummaryResult = {
  oneLiner: "一句话",
  chapters: [{ timestamp: 90, title: "开场", summary: "讲了开场" }],
  fullDigest: "精简稿正文"
}

const labels = {
  summarySection: "视频总结",
  commentsSection: "舆情报告",
  mindmapSection: "思维导图",
  oneLiner: "一句话简介",
  keyPoints: "分段要点",
  fullDigest: "全文精简稿",
  consensus: "核心共识",
  divergences: "主要分歧",
  gap: "视频 vs 观众",
  gapHit: "命中区",
  gapMiss: "盲区/溢出",
  mood: "舆情氛围",
  spotlight: "独立见解",
  source: "来源",
  author: "作者",
  exportedAt: "导出时间"
}

it("includes only sections with content", () => {
  const doc = buildNoteDocument({
    title: "视频标题",
    sourceUrl: "https://x/y",
    platform: "youtube",
    author: "UP",
    exportedAt: "2026-06-04",
    summary,
    comments: null,
    mindmap: null,
    labels
  })

  expect(doc.title).toBe("视频标题")
  expect(doc.meta).toEqual({ sourceUrl: "https://x/y", platform: "youtube", author: "UP", exportedAt: "2026-06-04" })
  expect(doc.sections.map(s => s.heading)).toEqual(["视频总结"])
})

it("renders chapter timestamps as M:SS text", () => {
  const doc = buildNoteDocument({
    title: "t", sourceUrl: "u", platform: "youtube", exportedAt: "2026-06-04",
    summary, comments: null, mindmap: null, labels
  })
  const summarySection = doc.sections[0]
  const bulletTexts = summarySection.blocks
    .filter(b => b.kind === "bullet")
    .map(b => (b as any).text.map((t: any) => t.text).join(""))
  expect(bulletTexts.some(t => t.includes("1:30") && t.includes("开场"))).toBe(true)
})

it("adds comments and mindmap sections when present", () => {
  const comments: CommentAnalysis = {
    consensus: [{ point: "共识1", heat: "high" }],
    divergences: [{ topic: "话题", sideA: "A", sideB: "B", rootCause: "根因" }],
    gap: { hit: "命中", miss: "盲区" },
    mood: ["催更", "理性"],
    spotlight: ["神回复"]
  }
  const doc = buildNoteDocument({
    title: "t", sourceUrl: "u", platform: "bilibili", exportedAt: "2026-06-04",
    summary: null, comments, mindmap: "# 根\n- 枝", labels
  })
  expect(doc.sections.map(s => s.heading)).toEqual(["舆情报告", "思维导图"])
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/NoteBuilder.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/NoteBuilder.ts`:

```ts
import type { SummaryResult, CommentAnalysis } from "../ai/types"
import type { NoteDocument, NoteSection, NoteBlock } from "./NoteDocument"
import { parseMindmap } from "./parseMindmap"

export interface NoteLabels {
  summarySection: string
  commentsSection: string
  mindmapSection: string
  oneLiner: string
  keyPoints: string
  fullDigest: string
  consensus: string
  divergences: string
  gap: string
  gapHit: string
  gapMiss: string
  mood: string
  spotlight: string
  source: string
  author: string
  exportedAt: string
}

export interface BuildInput {
  title: string
  sourceUrl: string
  platform: string
  author?: string
  exportedAt: string
  summary: SummaryResult | null
  comments: CommentAnalysis | null
  mindmap: string | null
  labels: NoteLabels
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function summarySection(s: SummaryResult, l: NoteLabels): NoteSection {
  const blocks: NoteBlock[] = [
    { kind: "heading", level: 3, text: l.oneLiner },
    { kind: "paragraph", text: [{ text: s.oneLiner }] },
    { kind: "heading", level: 3, text: l.keyPoints }
  ]
  for (const c of s.chapters) {
    blocks.push({
      kind: "bullet",
      text: [{ text: `${fmtTime(c.timestamp)} `, bold: true }, { text: c.title, bold: true }],
      children: [{ kind: "bullet", text: [{ text: c.summary }] }]
    })
  }
  blocks.push({ kind: "heading", level: 3, text: l.fullDigest })
  blocks.push({ kind: "paragraph", text: [{ text: s.fullDigest }] })
  return { heading: l.summarySection, blocks }
}

function commentsSection(a: CommentAnalysis, l: NoteLabels): NoteSection {
  const blocks: NoteBlock[] = [{ kind: "heading", level: 3, text: l.consensus }]
  for (const c of a.consensus) {
    blocks.push({ kind: "bullet", text: [{ text: c.point }, { text: `（${c.heat}）` }] })
  }
  blocks.push({ kind: "heading", level: 3, text: l.divergences })
  for (const d of a.divergences) {
    blocks.push({
      kind: "bullet",
      text: [{ text: d.topic, bold: true }],
      children: [
        { kind: "bullet", text: [{ text: `A: ${d.sideA}` }] },
        { kind: "bullet", text: [{ text: `B: ${d.sideB}` }] },
        { kind: "bullet", text: [{ text: d.rootCause }] }
      ]
    })
  }
  blocks.push({ kind: "heading", level: 3, text: l.gap })
  blocks.push({ kind: "bullet", text: [{ text: `${l.gapHit}: `, bold: true }, { text: a.gap.hit }] })
  blocks.push({ kind: "bullet", text: [{ text: `${l.gapMiss}: `, bold: true }, { text: a.gap.miss }] })
  blocks.push({ kind: "heading", level: 3, text: l.mood })
  blocks.push({ kind: "paragraph", text: [{ text: a.mood.join(" / ") }] })
  blocks.push({ kind: "heading", level: 3, text: l.spotlight })
  for (const sp of a.spotlight) {
    blocks.push({ kind: "bullet", text: [{ text: sp }] })
  }
  return { heading: l.commentsSection, blocks }
}

export function buildNoteDocument(input: BuildInput): NoteDocument {
  const { labels: l } = input
  const sections: NoteSection[] = []
  if (input.summary) sections.push(summarySection(input.summary, l))
  if (input.comments) sections.push(commentsSection(input.comments, l))
  if (input.mindmap && input.mindmap.trim()) {
    sections.push({ heading: l.mindmapSection, blocks: parseMindmap(input.mindmap) })
  }
  return {
    title: input.title,
    meta: {
      sourceUrl: input.sourceUrl,
      platform: input.platform,
      author: input.author,
      exportedAt: input.exportedAt
    },
    sections
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/NoteBuilder.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/NoteBuilder.ts src/services/export/NoteBuilder.test.ts
git commit -m "feat(export): add NoteBuilder"
```

---

## Task 7: toMarkdown 渲染器（纯）

**Files:**
- Create: `src/services/export/renderers/toMarkdown.ts`
- Test: `src/services/export/renderers/toMarkdown.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest"
import { toMarkdown } from "./toMarkdown"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "https://x/y", platform: "youtube", author: "UP", exportedAt: "2026-06-04" },
  sections: [
    {
      heading: "视频总结",
      blocks: [
        { kind: "heading", level: 3, text: "一句话简介" },
        { kind: "paragraph", text: [{ text: "正文" }] },
        { kind: "bullet", text: [{ text: "父", bold: true }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
      ]
    }
  ]
}

it("renders title, meta and nested bullets", () => {
  const md = toMarkdown(doc)
  expect(md).toContain("# 标题")
  expect(md).toContain("https://x/y")
  expect(md).toContain("## 视频总结")
  expect(md).toContain("### 一句话简介")
  expect(md).toContain("- **父**")
  expect(md).toContain("  - 子")
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/renderers/toMarkdown.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/renderers/toMarkdown.ts`:

```ts
import type { NoteDocument, NoteBlock, RichText } from "../NoteDocument"

function rich(parts: RichText[]): string {
  return parts.map(p => (p.bold ? `**${p.text}**` : p.text)).join("")
}

function block(b: NoteBlock, depth: number, out: string[]): void {
  if (b.kind === "heading") {
    out.push(`${"#".repeat(b.level)} ${b.text}`)
  } else if (b.kind === "paragraph") {
    out.push(rich(b.text))
  } else {
    out.push(`${"  ".repeat(depth)}- ${rich(b.text)}`)
    for (const child of b.children ?? []) block(child, depth + 1, out)
  }
}

export function toMarkdown(doc: NoteDocument): string {
  const out: string[] = [`# ${doc.title}`, ""]
  const m = doc.meta
  out.push(`${m.platform} · ${m.sourceUrl}`)
  if (m.author) out.push(`@${m.author}`)
  out.push(m.exportedAt, "")
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, "")
    for (const b of section.blocks) block(b, 0, out)
    out.push("")
  }
  return out.join("\n")
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/renderers/toMarkdown.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/renderers/toMarkdown.ts src/services/export/renderers/toMarkdown.test.ts
git commit -m "feat(export): add markdown renderer"
```

---

## Task 8: toNotionBlocks 渲染器（纯）

**Files:**
- Create: `src/services/export/renderers/toNotionBlocks.ts`
- Test: `src/services/export/renderers/toNotionBlocks.test.ts`

把 `NoteDocument` 转成 Notion block 对象数组。段落 → `paragraph`，heading level 2/3 → `heading_2`/`heading_3`，bullet → `bulleted_list_item`（children 嵌套）。每个分节前加一个 `heading_2`（分节标题）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest"
import { toNotionBlocks } from "./toNotionBlocks"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "https://x/y", platform: "youtube", exportedAt: "2026-06-04" },
  sections: [
    {
      heading: "视频总结",
      blocks: [
        { kind: "paragraph", text: [{ text: "正文" }] },
        { kind: "bullet", text: [{ text: "父", bold: true }], children: [{ kind: "bullet", text: [{ text: "子" }] }] }
      ]
    }
  ]
}

it("emits section heading_2 and nested bulleted_list_item", () => {
  const blocks = toNotionBlocks(doc)
  const sectionHeading = blocks.find((b: any) => b.type === "heading_2")
  expect(sectionHeading.heading_2.rich_text[0].text.content).toBe("视频总结")

  const bullet: any = blocks.find((b: any) => b.type === "bulleted_list_item")
  expect(bullet.bulleted_list_item.rich_text[0].text.content).toBe("父")
  expect(bullet.bulleted_list_item.rich_text[0].annotations.bold).toBe(true)
  expect(bullet.bulleted_list_item.children[0].bulleted_list_item.rich_text[0].text.content).toBe("子")
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/renderers/toNotionBlocks.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/renderers/toNotionBlocks.ts`:

```ts
import type { NoteDocument, NoteBlock, RichText } from "../NoteDocument"

function richText(parts: RichText[]) {
  return parts.map(p => ({
    type: "text",
    text: { content: p.text },
    annotations: p.bold ? { bold: true } : undefined
  }))
}

function toBlock(b: NoteBlock): any {
  if (b.kind === "heading") {
    const key = b.level === 2 ? "heading_2" : "heading_3"
    return { object: "block", type: key, [key]: { rich_text: richText([{ text: b.text }]) } }
  }
  if (b.kind === "paragraph") {
    return { object: "block", type: "paragraph", paragraph: { rich_text: richText(b.text) } }
  }
  const item: any = {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(b.text) }
  }
  if (b.children?.length) item.bulleted_list_item.children = b.children.map(toBlock)
  return item
}

export function toNotionBlocks(doc: NoteDocument): any[] {
  const blocks: any[] = []
  for (const section of doc.sections) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: richText([{ text: section.heading }]) }
    })
    for (const b of section.blocks) blocks.push(toBlock(b))
  }
  return blocks
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/renderers/toNotionBlocks.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/renderers/toNotionBlocks.ts src/services/export/renderers/toNotionBlocks.test.ts
git commit -m "feat(export): add notion blocks renderer"
```

---

## Task 9: background — FETCH_API 响应附带 status

**Files:**
- Modify: `src/background.ts:226-239`

为区分 Notion 的 401/404/429，让代理回传 HTTP 状态码。

- [ ] **Step 1: 修改 handleFetch 的响应**

把 `src/background.ts` 中 `handleFetch` 的成功/失败响应改为携带 `status`。将这段：

```ts
        const response = await fetch(url, fetchOptions)
        const text = await response.text()
        console.log(`[VA-BG] handleFetch ${url.substring(0, 80)} -> status=${response.status}, len=${text.length}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.substring(0, 50)}`)

        try {
            const data = JSON.parse(text)
            sendResponse({ success: true, data })
        } catch (e) {
            sendResponse({ success: true, data: text, isRaw: true })
        }
    } catch (error) {
        sendResponse({ success: false, error: (error as Error).message })
    }
```

替换为：

```ts
        const response = await fetch(url, fetchOptions)
        const text = await response.text()
        console.log(`[VA-BG] handleFetch ${url.substring(0, 80)} -> status=${response.status}, len=${text.length}`)
        if (!response.ok) {
            sendResponse({ success: false, error: `HTTP ${response.status}: ${text.substring(0, 200)}`, status: response.status })
            return
        }

        try {
            const data = JSON.parse(text)
            sendResponse({ success: true, data, status: response.status })
        } catch (e) {
            sendResponse({ success: true, data: text, isRaw: true, status: response.status })
        }
    } catch (error) {
        sendResponse({ success: false, error: (error as Error).message })
    }
```

- [ ] **Step 2: 验证编译**

Run: `ls -lt build/chrome-mv3-dev/background.* 2>/dev/null; npx tsc --noEmit -p tsconfig.json 2>&1 | head`
Expected: 无新增类型错误（背景脚本由常驻 watcher 增量编译；如未运行则以 tsc 检查为准）。

- [ ] **Step 3: 提交**

```bash
git add src/background.ts
git commit -m "feat(bg): include HTTP status in FETCH_API response"
```

---

## Task 10: fetchProxy 封装 + 类型

**Files:**
- Create: `src/services/export/fetchProxy.ts`

- [ ] **Step 1: 实现**

Create `src/services/export/fetchProxy.ts`:

```ts
export type ProxyResponse =
  | { success: true; data: any; status?: number; isRaw?: boolean }
  | { success: false; error: string; status?: number }

export type FetchProxy = (url: string, options: any) => Promise<ProxyResponse>

export const backgroundFetchProxy: FetchProxy = (url, options) =>
  chrome.runtime.sendMessage({ type: "FETCH_API", url, options })
```

- [ ] **Step 2: 提交**

```bash
git add src/services/export/fetchProxy.ts
git commit -m "feat(export): add background fetch proxy wrapper"
```

---

## Task 11: NotionClient（接口 + TokenNotionClient）

**Files:**
- Create: `src/services/export/NotionClient.ts`
- Test: `src/services/export/NotionClient.test.ts`

接口可插拔（OAuth 版以后实现）。`TokenNotionClient` 注入 `FetchProxy` 便于测试。负责：在父页面下建子页面（标题 + 首批 ≤100 块），再分批 `PATCH` 追加剩余块。错误按 status 映射成错误码。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest"
import { TokenNotionClient } from "./NotionClient"
import type { ProxyResponse } from "./fetchProxy"

function makeProxy(responses: ProxyResponse[]) {
  const calls: { url: string; options: any }[] = []
  const fn = vi.fn(async (url: string, options: any) => {
    calls.push({ url, options })
    return responses.shift()!
  })
  return { fn, calls }
}

it("creates a child page under the parent page", async () => {
  const { fn, calls } = makeProxy([{ success: true, data: { id: "new-page-id" }, status: 200 }])
  const client = new TokenNotionClient("secret_x", fn)

  await client.createPage("parent-123", "我的标题", [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }])

  expect(calls[0].url).toBe("https://api.notion.com/v1/pages")
  const body = JSON.parse(calls[0].options.body)
  expect(body.parent).toEqual({ page_id: "parent-123" })
  expect(body.properties.title.title[0].text.content).toBe("我的标题")
  expect(calls[0].options.headers.Authorization).toBe("Bearer secret_x")
  expect(calls[0].options.headers["Notion-Version"]).toBeTruthy()
})

it("batches blocks beyond 100 via append", async () => {
  const blocks = Array.from({ length: 150 }, () => ({ object: "block", type: "paragraph", paragraph: { rich_text: [] } }))
  const { fn, calls } = makeProxy([
    { success: true, data: { id: "pid" }, status: 200 },
    { success: true, data: {}, status: 200 }
  ])
  const client = new TokenNotionClient("secret_x", fn)

  await client.createPage("parent", "t", blocks)

  expect(JSON.parse(calls[0].options.body).children.length).toBe(100)
  expect(calls[1].url).toBe("https://api.notion.com/v1/blocks/pid/children")
  expect(JSON.parse(calls[1].options.body).children.length).toBe(50)
})

it("maps 401 to an invalid-token error", async () => {
  const { fn } = makeProxy([{ success: false, error: "HTTP 401: unauthorized", status: 401 }])
  const client = new TokenNotionClient("bad", fn)
  await expect(client.createPage("p", "t", [])).rejects.toThrow("NOTION_UNAUTHORIZED")
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/NotionClient.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/NotionClient.ts`:

```ts
import type { FetchProxy } from "./fetchProxy"
import { backgroundFetchProxy } from "./fetchProxy"

const NOTION_VERSION = "2022-06-28"
const MAX_BLOCKS = 100

export interface NotionClient {
  createPage(parentPageId: string, title: string, blocks: any[]): Promise<string>
}

function mapError(status: number | undefined, raw: string): Error {
  if (status === 401) return new Error("NOTION_UNAUTHORIZED")
  if (status === 404) return new Error("NOTION_PARENT_NOT_FOUND")
  if (status === 429) return new Error("NOTION_RATE_LIMITED")
  return new Error(`NOTION_ERROR: ${raw}`)
}

export class TokenNotionClient implements NotionClient {
  constructor(private token: string, private proxy: FetchProxy = backgroundFetchProxy) {}

  private headers() {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  }

  async createPage(parentPageId: string, title: string, blocks: any[]): Promise<string> {
    const first = blocks.slice(0, MAX_BLOCKS)
    const rest = blocks.slice(MAX_BLOCKS)

    const createResp = await this.proxy("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: { title: { title: [{ text: { content: title } }] } },
        children: first
      })
    })
    if (!createResp.success) throw mapError(createResp.status, createResp.error)
    const pageId = createResp.data.id as string

    for (let i = 0; i < rest.length; i += MAX_BLOCKS) {
      const batch = rest.slice(i, i + MAX_BLOCKS)
      const appendResp = await this.proxy(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ children: batch })
      })
      if (!appendResp.success) throw mapError(appendResp.status, appendResp.error)
    }
    return pageId
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/NotionClient.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/NotionClient.ts src/services/export/NotionClient.test.ts
git commit -m "feat(export): add NotionClient with token auth and block batching"
```

---

## Task 12: ExportTarget 接口

**Files:**
- Create: `src/services/export/targets/ExportTarget.ts`

- [ ] **Step 1: 实现**

Create `src/services/export/targets/ExportTarget.ts`:

```ts
import type { NoteDocument } from "../NoteDocument"

export type ExportResultKind = "success" | "invoked" | "fallback-download" | "fallback-clipboard"

export interface ExportResult {
  kind: ExportResultKind
  message?: string
}

export interface ExportTarget {
  id: "notion" | "obsidian" | "download"
  isConfigured(): boolean
  export(doc: NoteDocument): Promise<ExportResult>
}
```

- [ ] **Step 2: 提交**

```bash
git add src/services/export/targets/ExportTarget.ts
git commit -m "feat(export): add ExportTarget interface"
```

---

## Task 13: ObsidianTarget（含纯函数 buildObsidianRequest）

**Files:**
- Create: `src/services/export/targets/ObsidianTarget.ts`
- Test: `src/services/export/targets/ObsidianTarget.test.ts`

把 URI 构造与长度判定抽成纯函数 `buildObsidianRequest`：内容编码后 ≤ 阈值 → `{action:"uri", url}`；否则 → `{action:"fallback", markdown, filename}`。副作用（`window.open`/剪贴板/下载）在 `export()` 里执行。

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/targets/ObsidianTarget.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/targets/ObsidianTarget.ts`:

```ts
import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"
import { DownloadTarget } from "./DownloadTarget"

export const OBSIDIAN_MAX_CONTENT = 8000

export type ObsidianRequest =
  | { action: "uri"; url: string }
  | { action: "fallback"; markdown: string; filename: string }

export function buildObsidianRequest(input: {
  vault: string
  folder: string
  title: string
  markdown: string
}): ObsidianRequest {
  const encodedContent = encodeURIComponent(input.markdown)
  if (encodedContent.length > OBSIDIAN_MAX_CONTENT) {
    return { action: "fallback", markdown: input.markdown, filename: `${sanitizeFilename(input.title)}.md` }
  }
  const name = sanitizeFilename(input.title)
  const filePath = input.folder ? `${input.folder.replace(/^\/+|\/+$/g, "")}/${name}` : name
  const url =
    `obsidian://new?vault=${encodeURIComponent(input.vault)}` +
    `&file=${encodeURIComponent(filePath)}` +
    `&content=${encodedContent}`
  return { action: "uri", url }
}

export class ObsidianTarget implements ExportTarget {
  id = "obsidian" as const

  constructor(private vault: string, private folder: string = "") {}

  isConfigured(): boolean {
    return this.vault.trim().length > 0
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    const markdown = toMarkdown(doc)
    const req = buildObsidianRequest({ vault: this.vault, folder: this.folder, title: doc.title, markdown })
    if (req.action === "uri") {
      window.open(req.url, "_blank")
      return { kind: "invoked" }
    }
    try {
      await navigator.clipboard.writeText(req.markdown)
    } catch {
      // clipboard may be unavailable; download still covers the user
    }
    new DownloadTarget().download(req.markdown, req.filename)
    return { kind: "fallback-download" }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/targets/ObsidianTarget.test.ts`
Expected: PASS。

> 注：本测试只覆盖纯函数 `buildObsidianRequest`，不触发 `export()`（避免依赖 window/DownloadTarget）。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/targets/ObsidianTarget.ts src/services/export/targets/ObsidianTarget.test.ts
git commit -m "feat(export): add ObsidianTarget with length-guarded URI"
```

---

## Task 14: DownloadTarget

**Files:**
- Create: `src/services/export/targets/DownloadTarget.ts`

通用 `.md` 下载，供 Obsidian 回退与"下载 .md"目标共用。无单测（纯 DOM 副作用），由 Task 19 手动验证。

- [ ] **Step 1: 实现**

Create `src/services/export/targets/DownloadTarget.ts`:

```ts
import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import { toMarkdown } from "../renderers/toMarkdown"
import { sanitizeFilename } from "../sanitizeFilename"

export class DownloadTarget implements ExportTarget {
  id = "download" as const

  isConfigured(): boolean {
    return true
  }

  download(content: string, filename: string): void {
    const blob = new Blob([content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    this.download(toMarkdown(doc), `${sanitizeFilename(doc.title)}.md`)
    return { kind: "success" }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/services/export/targets/DownloadTarget.ts
git commit -m "feat(export): add DownloadTarget"
```

---

## Task 15: NotionTarget

**Files:**
- Create: `src/services/export/targets/NotionTarget.ts`
- Test: `src/services/export/targets/NotionTarget.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest"
import { NotionTarget } from "./NotionTarget"
import type { NotionClient } from "../NotionClient"
import type { NoteDocument } from "../NoteDocument"

const doc: NoteDocument = {
  title: "标题",
  meta: { sourceUrl: "u", platform: "youtube", exportedAt: "2026-04-06" },
  sections: [{ heading: "视频总结", blocks: [{ kind: "paragraph", text: [{ text: "正文" }] }] }]
}

it("creates a notion page from the document", async () => {
  const client: NotionClient = { createPage: vi.fn(async () => "pid") }
  const target = new NotionTarget(client, "parent-123")

  const result = await target.export(doc)

  expect(result.kind).toBe("success")
  expect(client.createPage).toHaveBeenCalledWith("parent-123", "标题", expect.any(Array))
})

it("is not configured without a parent id", () => {
  const client: NotionClient = { createPage: vi.fn() }
  expect(new NotionTarget(client, "").isConfigured()).toBe(false)
  expect(new NotionTarget(client, "p").isConfigured()).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/services/export/targets/NotionTarget.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

Create `src/services/export/targets/NotionTarget.ts`:

```ts
import type { NoteDocument } from "../NoteDocument"
import type { ExportTarget, ExportResult } from "./ExportTarget"
import type { NotionClient } from "../NotionClient"
import { toNotionBlocks } from "../renderers/toNotionBlocks"

export class NotionTarget implements ExportTarget {
  id = "notion" as const

  constructor(private client: NotionClient, private parentPageId: string) {}

  isConfigured(): boolean {
    return this.parentPageId.trim().length > 0
  }

  async export(doc: NoteDocument): Promise<ExportResult> {
    await this.client.createPage(this.parentPageId, doc.title, toNotionBlocks(doc))
    return { kind: "success" }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/services/export/targets/NotionTarget.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/services/export/targets/NotionTarget.ts src/services/export/targets/NotionTarget.test.ts
git commit -m "feat(export): add NotionTarget"
```

---

## Task 16: ExportService 编排器

**Files:**
- Modify: `src/services/export/ExportService.ts`

保留旧静态方法 `toMarkdown(summary,...)`、`download(...)`（`useSummary` 仍在用），新增从 storage 读取配置、构建目标、导出的能力。

- [ ] **Step 1: 重写 ExportService（保留旧方法）**

把 `src/services/export/ExportService.ts` 替换为：

```ts
import { Storage } from "@plasmohq/storage"
import type { SummaryResult } from "../ai/types"
import type { NoteDocument } from "./NoteDocument"
import type { ExportTarget, ExportResult } from "./targets/ExportTarget"
import { NotionTarget } from "./targets/NotionTarget"
import { ObsidianTarget } from "./targets/ObsidianTarget"
import { DownloadTarget } from "./targets/DownloadTarget"
import { TokenNotionClient } from "./NotionClient"

const storage = new Storage()

export type TargetId = "notion" | "obsidian" | "download"

export class ExportService {
  // ── 旧能力：仅下载总结（useSummary 在用，保持兼容）──
  static toMarkdown(summary: SummaryResult, videoTitle: string, videoUrl: string): string {
    const lines = [
      `# ${videoTitle}`,
      `Source: ${videoUrl}`,
      `\n## One Liner`,
      summary.oneLiner,
      `\n## Key Points`
    ]
    summary.chapters.forEach(chap => {
      const m = Math.floor(chap.timestamp / 60)
      const s = Math.floor(chap.timestamp % 60).toString().padStart(2, "0")
      lines.push(`- **${m}:${s}** ${chap.title}`)
      lines.push(`  - ${chap.summary}`)
    })
    lines.push(`\n## Full Digest`)
    lines.push(summary.fullDigest)
    return lines.join("\n")
  }

  static download(content: string, filename: string) {
    new DownloadTarget().download(content, filename)
  }

  // ── 新能力：多目标导出 ──
  static async buildTarget(id: TargetId): Promise<ExportTarget> {
    if (id === "download") return new DownloadTarget()
    if (id === "notion") {
      const token = (await storage.get("notionToken")) || ""
      const parentId = (await storage.get("notionParentPageId")) || ""
      return new NotionTarget(new TokenNotionClient(token), parentId)
    }
    const vault = (await storage.get("obsidianVault")) || ""
    const folder = (await storage.get("obsidianFolder")) || ""
    return new ObsidianTarget(vault, folder)
  }

  static async exportTo(id: TargetId, doc: NoteDocument): Promise<ExportResult> {
    const target = await ExportService.buildTarget(id)
    return target.export(doc)
  }
}
```

- [ ] **Step 2: 验证旧调用方仍编译**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "useSummary\|ExportService" | head`
Expected: 无错误（`useSummary` 用的 `toMarkdown`/`download` 签名未变）。

- [ ] **Step 3: 提交**

```bash
git add src/services/export/ExportService.ts
git commit -m "feat(export): turn ExportService into multi-target orchestrator"
```

---

## Task 17: i18n — 删 Readwise，加新 key（10 locale）

**Files:**
- Modify: `src/i18n/locales/{zh-CN,en,ja,ko,fr,es,pt,id,hi,ar}.json`

每个 locale 在 `options.labels` 删除 `readwiseToken`；在 `options.labels` 增加 `notionParentPageId`、`obsidianVault`（语义改为 vault 名）、`obsidianFolder`；在 `options.placeholders` 增 `notionParentPageId`、`obsidianFolder`，改 `obsidianVault`；新增 `export` 顶层命名空间（菜单与提示）。下面给出 `zh-CN` 与 `en` 的具体内容，其余 8 个 locale 用英文文案占位（可后续翻译），保证 key 齐全不漏。

- [ ] **Step 1: 改 zh-CN**

`src/i18n/locales/zh-CN.json`：删除 `options.labels.readwiseToken`。`options.labels` 增加：

```json
"notionParentPageId": "Notion 父页面 ID",
"obsidianVault": "Obsidian Vault 名称",
"obsidianFolder": "Obsidian 目标文件夹（可选）"
```

`options.placeholders` 改/增：

```json
"notionToken": "secret_...",
"notionParentPageId": "把目标页面分享给 integration 后，粘贴其 32 位 ID",
"obsidianVault": "你的 vault 名称（区分大小写）",
"obsidianFolder": "如 Clippings/Videos"
```

顶层新增（与现有 `summary`/`comments` 等同级）。注意 `labels` 子对象是导出笔记内的分节小标题，由 `ExportMenu` 传给 `NoteBuilder`：

```json
"exportMenu": {
  "button": "导出",
  "toNotion": "导入到 Notion",
  "toObsidian": "导入到 Obsidian",
  "download": "下载 .md",
  "needConfig": "请先在设置中配置",
  "empty": "暂无可导出的内容，请先生成总结/分析/导图",
  "notionSuccess": "已导入 Notion",
  "obsidianInvoked": "已唤起 Obsidian",
  "downloaded": "已下载文件",
  "fallbackDownloaded": "内容较长，已改为下载文件",
  "errorUnauthorized": "Notion Token 无效",
  "errorParentNotFound": "未找到父页面，请确认已把页面分享给 integration",
  "errorRateLimited": "Notion 请求过于频繁，请稍后重试",
  "errorGeneric": "导出失败",
  "labels": {
    "summarySection": "视频总结",
    "commentsSection": "舆情报告",
    "mindmapSection": "思维导图",
    "oneLiner": "一句话简介",
    "keyPoints": "分段要点",
    "fullDigest": "全文精简稿",
    "consensus": "核心共识",
    "divergences": "主要分歧",
    "gap": "视频 vs 观众",
    "gapHit": "命中区",
    "gapMiss": "盲区/溢出",
    "mood": "舆情氛围",
    "spotlight": "独立见解"
  }
}
```

- [ ] **Step 2: 改 en**

`src/i18n/locales/en.json`：删除 `options.labels.readwiseToken`。`options.labels` 增加：

```json
"notionParentPageId": "Notion Parent Page ID",
"obsidianVault": "Obsidian Vault Name",
"obsidianFolder": "Obsidian Target Folder (optional)"
```

`options.placeholders` 改/增：

```json
"notionToken": "secret_...",
"notionParentPageId": "Share the page with your integration, then paste its 32-char ID",
"obsidianVault": "Your vault name (case-sensitive)",
"obsidianFolder": "e.g. Clippings/Videos"
```

顶层新增 `exportMenu`：

```json
"exportMenu": {
  "button": "Export",
  "toNotion": "Send to Notion",
  "toObsidian": "Send to Obsidian",
  "download": "Download .md",
  "needConfig": "Configure this in Settings first",
  "empty": "Nothing to export yet — generate a summary/analysis/mind map first",
  "notionSuccess": "Sent to Notion",
  "obsidianInvoked": "Obsidian opened",
  "downloaded": "File downloaded",
  "fallbackDownloaded": "Content too long — downloaded a file instead",
  "errorUnauthorized": "Invalid Notion token",
  "errorParentNotFound": "Parent page not found — make sure it's shared with your integration",
  "errorRateLimited": "Notion is rate-limiting — try again shortly",
  "errorGeneric": "Export failed",
  "labels": {
    "summarySection": "Video Summary",
    "commentsSection": "Comment Insights",
    "mindmapSection": "Mind Map",
    "oneLiner": "One-liner",
    "keyPoints": "Key Points",
    "fullDigest": "Full Digest",
    "consensus": "Consensus",
    "divergences": "Divergences",
    "gap": "Video vs Audience",
    "gapHit": "Hit",
    "gapMiss": "Blind spot / Overflow",
    "mood": "Mood",
    "spotlight": "Spotlight"
  }
}
```

- [ ] **Step 3: 其余 8 个 locale**

对 `ja, ko, fr, es, pt, id, hi, ar` 各文件：删除 `options.labels.readwiseToken`；加入与 en 相同 key 结构的 `options.labels.{notionParentPageId,obsidianVault,obsidianFolder}`、`options.placeholders.{notionParentPageId,obsidianFolder}`（并改 `obsidianVault`）、顶层 `exportMenu`，**值先用 en 文案占位**（保证不缺 key、运行不报错；翻译后续补）。

- [ ] **Step 4: 校验所有 locale JSON 合法且 key 齐全**

Run:
```bash
node -e '
const fs=require("fs"),d="src/i18n/locales/";
const files=fs.readdirSync(d).filter(f=>f.endsWith(".json"));
for(const f of files){
  const j=JSON.parse(fs.readFileSync(d+f,"utf8"));
  const miss=[];
  if(j.options?.labels?.readwiseToken!==undefined) miss.push("readwiseToken still present");
  for(const k of ["notionParentPageId","obsidianVault","obsidianFolder"]) if(!j.options?.labels?.[k]) miss.push("labels."+k);
  if(!j.exportMenu?.button) miss.push("exportMenu");
  console.log(f, miss.length?("FAIL "+miss.join(",")):"OK");
}
'
```
Expected: 每个文件输出 `OK`。

- [ ] **Step 5: 提交**

```bash
git add src/i18n/locales
git commit -m "i18n: remove Readwise, add Notion/Obsidian export keys"
```

---

## Task 18: 设置页 UI（options.tsx）

**Files:**
- Modify: `src/options.tsx`（state 行 133-135、加载 183-198、保存 211-213、Section 4 渲染 490-509）

删除 Readwise 输入框；Notion 增加父页面 ID；Obsidian 字段语义改为 vault 名 + 新增文件夹。无单测，Task 19 手动验证。

- [ ] **Step 1: 改 state**

`src/options.tsx` 第 133-135 行：删除 `readwiseToken` 的 state，新增三个：

```tsx
const [notionToken, setNotionToken] = useState("")
const [notionParentPageId, setNotionParentPageId] = useState("")
const [obsidianVault, setObsidianVault] = useState("")
const [obsidianFolder, setObsidianFolder] = useState("")
```

- [ ] **Step 2: 改加载逻辑**

第 183-198 行附近：删除 `readwise` 读取与 `setReadwiseToken`，加入：

```tsx
const notion = await storage.get("notionToken") || ""
const notionParent = await storage.get("notionParentPageId") || ""
const obsidian = await storage.get("obsidianVault") || ""
const obsidianFld = await storage.get("obsidianFolder") || ""
// ...
setNotionToken(notion)
setNotionParentPageId(notionParent)
setObsidianVault(obsidian)
setObsidianFolder(obsidianFld)
```

- [ ] **Step 3: 改保存逻辑**

第 211-213 行：删除 `readwiseToken` 保存，加入：

```tsx
await storage.set("notionToken", notionToken)
await storage.set("notionParentPageId", notionParentPageId)
await storage.set("obsidianVault", obsidianVault)
await storage.set("obsidianFolder", obsidianFolder)
```

- [ ] **Step 4: 改 Section 4 渲染**

把 Readwise 的 `<div>` 块（原 490-498 行）整体删除；在 Notion Token 块后加入父页面 ID 块；把 Obsidian 块改为 vault 名并在其后加文件夹块：

```tsx
<div>
  <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.notionParentPageId")}</label>
  <input
    type="text"
    value={notionParentPageId}
    onChange={(e) => setNotionParentPageId(e.target.value)}
    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
    placeholder={t("options.placeholders.notionParentPageId")}
  />
</div>

<div>
  <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianVault")}</label>
  <input
    type="text"
    value={obsidianVault}
    onChange={(e) => setObsidianVault(e.target.value)}
    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
    placeholder={t("options.placeholders.obsidianVault")}
  />
</div>

<div>
  <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianFolder")}</label>
  <input
    type="text"
    value={obsidianFolder}
    onChange={(e) => setObsidianFolder(e.target.value)}
    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
    placeholder={t("options.placeholders.obsidianFolder")}
  />
</div>
```

- [ ] **Step 5: 验证编译并提交**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i options | head`
Expected: 无错误。

```bash
git add src/options.tsx
git commit -m "feat(options): replace Readwise with Notion parent id + Obsidian vault/folder"
```

---

## Task 19: ExportMenu 组件

**Files:**
- Create: `src/components/Sidebar/ExportMenu.tsx`

下拉菜单，列三个目标。点击时：从 `useVideo()` 取 `cachedData`/`videoInfo`/`platform`，组装 `NoteDocument`，调 `ExportService.exportTo`，按结果/错误码弹 toast。三类内容全空则提示 `exportMenu.empty`。

- [ ] **Step 1: 实现**

Create `src/components/Sidebar/ExportMenu.tsx`:

```tsx
import { useState } from "react"
import { Download } from "lucide-react"
import { useVideo } from "../../contexts/VideoContext"
import { useTranslation } from "../../i18n/useTranslation"
import { ExportService, type TargetId } from "../../services/export/ExportService"
import { buildNoteDocument, type NoteLabels } from "../../services/export/NoteBuilder"
import { buildVideoUrl } from "../../services/export/buildVideoUrl"

export function ExportMenu() {
  const { cachedData, videoInfo, platform } = useVideo()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState("")

  const hasContent = !!(cachedData.summary || cachedData.comments || cachedData.mindmap)

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
    // source/author/exportedAt 仅作为 NoteLabels 接口占位，NoteBuilder 当前未使用它们渲染标签
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
    if (!hasContent || !videoInfo) {
      flash(t("exportMenu.empty"))
      return
    }
    const doc = buildNoteDocument({
      title: videoInfo.title,
      sourceUrl: buildVideoUrl(platform, videoInfo.id),
      platform,
      author: videoInfo.author,
      exportedAt: new Date().toISOString().slice(0, 10),
      summary: cachedData.summary,
      comments: cachedData.comments,
      mindmap: cachedData.mindmap,
      labels
    })
    try {
      const result = await ExportService.exportTo(id, doc)
      if (result.kind === "invoked") flash(t("exportMenu.obsidianInvoked"))
      else if (result.kind === "fallback-download") flash(t("exportMenu.fallbackDownloaded"))
      else if (id === "notion") flash(t("exportMenu.notionSuccess"))
      else flash(t("exportMenu.downloaded"))
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

> **实现注意：** 分节小标题统一来自 Task 17 新增的 `exportMenu.labels.*`（已确认现有 `summary.*`/`comments.*` 这类零散 key 在 locale 中并不存在，故不复用）。本任务依赖 Task 17 已完成。`NoteLabels` 的 `source`/`author`/`exportedAt` 三个字段当前 `NoteBuilder` 未用于渲染，传空串即可。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i exportmenu | head`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/Sidebar/ExportMenu.tsx
git commit -m "feat(sidebar): add ExportMenu component"
```

---

## Task 20: 接入 Sidebar header

**Files:**
- Modify: `src/components/Sidebar/index.tsx`（header 区 30-39 行 + 顶部 import）

- [ ] **Step 1: 引入并放置**

在 `src/components/Sidebar/index.tsx` 顶部 import 区加：

```tsx
import { ExportMenu } from "./ExportMenu"
```

把 header 里 `<LanguageSwitcher variant="compact" />` 与关闭按钮之间插入 `<ExportMenu />`：

```tsx
<LanguageSwitcher variant="compact" />
<ExportMenu />
<button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors" title={t("common.close")}>
  <X size={20} />
</button>
```

- [ ] **Step 2: 验证编译**

Run: `ls -lt build/chrome-mv3-dev/contents/*.js build/chrome-mv3-dev/*.js 2>/dev/null | head -3; npx tsc --noEmit -p tsconfig.json 2>&1 | head`
Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/Sidebar/index.tsx
git commit -m "feat(sidebar): mount ExportMenu in header"
```

---

## Task 21: 全量测试 + 手动验证

**Files:** 无（验证任务）

- [ ] **Step 1: 跑全部单测**

Run: `pnpm test`
Expected: 所有测试 PASS。

- [ ] **Step 2: 确认增量编译**

Run: `ls -lt build/chrome-mv3-dev/*.js build/chrome-mv3-dev/contents/*.js 2>/dev/null | head`
Expected: 相关产物 mtime 为最近（常驻 watcher 已编译）。

- [ ] **Step 3: 通过 chrome-devtools MCP 重载并人工走查**

按用户记忆的 reload 流程（reload 插件 + 刷新视频页），在一个 B 站/YouTube 视频页验证：
1. 生成总结/评论分析/思维导图至少各一项。
2. 点 header 的导出按钮 → 下拉出现三项。
3. 设置页填好 Obsidian vault 名 → 点"导入到 Obsidian" → 唤起 Obsidian 新建笔记，三节内容齐全、思维导图为嵌套大纲。
4. 设置页填好 Notion token + 父页面 ID（并把页面分享给 integration）→ 点"导入到 Notion" → 父页面下出现新子页面，内容正确。
5. 故意填错 Notion token → 弹"Token 无效"。
6. 点"下载 .md" → 得到合并 Markdown 文件。

- [ ] **Step 4: 收尾提交（如有手动调整）**

```bash
git add -A
git commit -m "test: verify Notion/Obsidian export end-to-end"
```

---

## Self-Review 记录

- **Spec 覆盖**：§3 架构→Task 2/6/7/8/12-16；§4 内容映射→Task 6；§5 Notion→Task 9/10/11/15/16；§6 Obsidian→Task 13/14；§7 UI→Task 18/19/20；§8 i18n→Task 17；§9 错误处理→Task 11(mapError)+19(toast)；§10 测试→各纯函数 Task + Task 21；§11 范围外不实现。✅
- **占位符**：无 TBD/TODO；所有代码步骤含完整代码。✅
- **类型一致性**：`NoteDocument`/`NoteBlock`/`RichText`（Task 2）贯穿 6/7/13/14/15；`ExportTarget`/`ExportResult`（Task 12）被 13/14/15 实现；`NotionClient.createPage`（Task 11）签名与 Task 15 调用一致；`ExportService.exportTo`/`TargetId`（Task 16）与 Task 19 调用一致；`buildNoteDocument`/`NoteLabels`（Task 6）与 Task 19 调用一致。✅
- **已知后续依赖**：Task 19 依赖部分 `summary.*`/`comments.*` i18n key，已在该任务备注中要求实现前核对补齐。
