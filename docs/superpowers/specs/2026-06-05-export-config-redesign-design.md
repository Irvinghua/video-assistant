# 知识导出配置重构设计文档

- 日期：2026-06-05
- 状态：已通过 brainstorming，待实现
- 范围：重构「知识导出」设置区与 sidebar 导出行为——目标下拉 + 条件配置、导出结构四选一、未配置时引导设置页、按结构自动补生成缺失章节。建立在已实现的导出功能（`docs/superpowers/specs/2026-06-04-notion-obsidian-export-design.md`）之上。

## 1. 背景与目标

当前「知识导出」设置区是平铺的 Notion/Obsidian 输入框；sidebar 导出按结构固定为"已缓存的全部内容"。本次让配置更合理：
- 设置页用"目标下拉 + 条件渲染配置"组织（跟随已有 `chatProvider` 模式）。
- 增加"导出结构"四选一，决定导出哪些章节。
- 未配置目标时点导出 → 打开设置页引导。
- 按选定结构导出；选定但未生成的章节，自动调用生成服务补齐并缓存。

## 2. 关键决策（brainstorming 已确认）

| 议题 | 决策 |
| --- | --- |
| 配置存储 | **chrome.storage.local 永久保存，无 TTL**（和 token/provider 一致）。3 天 TTL 只作用于生成内容缓存（`cacheService`）。 |
| sidebar 导出 | **保留下拉**（Notion / Obsidian / 下载 .md），可分别点；点未配置目标 → 打开设置页。设置页目标下拉仅用于组织显示哪组配置。 |
| 缺失章节 | **自动补生成**：缺失的选定章节调用对应生成服务现场生成，写入缓存（3 天 TTL）。 |
| ASR 边界 | 自动补生成只覆盖**字幕路径**。当「总结/思维导图」所需的字幕/script 不可用（需 ASR 转写）时，**不静默跑 ASR**，改为 toast 引导用户去总结面板手动转写。 |

## 3. 配置数据模型与存储

新增持久化 key（`@plasmohq/storage` → `chrome.storage.local`，永久）：

- `exportTarget`: `"notion" | "obsidian"`，默认 `"notion"`。设置页下拉选择，决定显示哪组配置。
- `exportStructure`: `"summary" | "summary_comments" | "summary_mindmap" | "summary_comments_mindmap"`，默认 `"summary"`。

沿用现有：`notionToken` / `notionParentPageId` / `obsidianVault` / `obsidianFolder`（均永久）。

结构 → 章节集合映射（总结恒含）：

| exportStructure | summary | comments | mindmap |
| --- | --- | --- | --- |
| `summary` | ✓ | | |
| `summary_comments` | ✓ | ✓ | |
| `summary_mindmap` | ✓ | | ✓ |
| `summary_comments_mindmap` | ✓ | ✓ | ✓ |

## 4. 设置页「知识导出」区重构（`src/options.tsx`）

跟随现有 `chatProvider` 的"下拉 + 条件渲染"模式：

- **导出目标**下拉（`exportTarget`）：Notion / Obsidian。
  - = Notion → 显示 `Notion Token`（password）+ `父页面 ID`（text）。
  - = Obsidian → 显示 `Vault 名称`（text）+ `目标文件夹`（text，可选）。
- **导出结构**下拉（`exportStructure`）：四选一，默认"仅总结"。
- 两组配置的输入值都持久化（即使当前下拉没显示某目标，它的已存值仍保留——切换下拉只切显示，不清空对方的存值）。
- 保存逻辑：`handleSave` 写入 `exportTarget`、`exportStructure` 及所有目标配置 key。

## 5. Sidebar 导出行为（`src/components/Sidebar/ExportMenu.tsx`）

下拉仍为 `Notion / Obsidian / 下载 .md`。点击某项 `handle(id)`：

1. **目标配置校验**（仅 Notion/Obsidian）：读取该目标配置，`isConfigured` 为 false →
   - 发 `chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" })`（background 已有该 handler）打开设置页；
   - toast "请先配置 Notion / Obsidian"；return。
2. 读取 `exportStructure` → 需要的章节集合。
3. 调 `ExportContentProvider.ensureSections(...)`（§6）拿到各选定章节内容（缺失的已补生成）。
4. `buildNoteDocument` **只接收结构选定的章节**（即使缓存里有更多）→ 导出到目标。
5. 下载 .md 同样按结构组装，但跳过步骤 1（无需配置）。

各阶段 toast：补生成中 "正在生成缺失章节…"、补生成失败 / 需 ASR 引导、导出结果（沿用已有 invoked/downloaded/notionSuccess 等）。

## 6. ExportContentProvider（结构驱动 + 自动补生成）

新增 `src/services/export/ExportContentProvider.ts`——纯编排，不含 React，可单测（依赖注入）。

```ts
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
  missing: ("summary" | "comments" | "mindmap")[]  // 因前置缺失而无法生成的章节
}

// sections: 由 exportStructure 推导出的需要集合
// onGenerate: 仅在“真正开始生成某章节”时触发（缓存未命中且前置就绪），供 UI 精确弹提示
export async function ensureSections(
  sections: Set<"summary" | "comments" | "mindmap">,
  inputs: SectionInputs,
  deps?: EnsureDeps,
  onGenerate?: (section: "summary" | "comments" | "mindmap") => void
): Promise<EnsureResult>
```

逐章节逻辑（每个先读 `cacheService`，命中即用；未命中按下表生成并 `cacheService.set(..., 3天TTL)`）：

| 章节 | 生成服务 | 前置 | 前置缺失时 |
| --- | --- | --- | --- |
| summary | `new VideoSummarizer().summarize(subtitles, language)` | subtitles 非空 | 列入 `missing`（需 ASR，不自动跑） |
| comments | `new CommentAnalyzer().analyze(sampledComments, script, language)`；`script = getPlainScript(platform, videoId)` | sampledComments 非空 **且** script 可得 | 列入 `missing` |
| mindmap | `AIServiceFactory.getService()` + mindmap prompt（复用 `useMindMap` 的生成逻辑，抽成可复用函数） | script 可得（subtitles/缓存字幕） | 列入 `missing`（需 ASR，不自动跑） |

- 生成全部走 `AIServiceFactory.getService()`，需用户已配置 chat provider/API key；未配置 → 抛错 → ExportMenu toast "请先配置 AI 模型 / API Key"。
- `ensureSections` 返回的 `missing` 非空时，ExportMenu toast 引导（如"视频无字幕，请先在总结面板用 ASR 生成总结"），并按"只导已生成的"继续导出可用章节（与 brainstorming"缺失章节"选项的精神一致：能补的补、补不了的提示并跳过）。
- 抽取注意：`useMindMap` 当前把 mindmap 生成逻辑内联在 hook 里，需要将"script → markdown"的核心抽成 `src/services/export/`（或 `services/mindmap/`）下的纯函数，供 hook 与 provider 共用，避免逻辑重复。
- **"正在生成"提示的准确性（修订 2026-06-05）**：`ensureSections` 通过 `onGenerate` 回调在**真正开始生成**某章节时才通知调用方；ExportMenu 据此弹"正在生成缺失章节"。**不再**在调用 `ensureSections` 前无条件弹该提示——否则当所选章节已全部缓存（无需生成）时也会误弹。

## 7. NoteBuilder 结构过滤

`buildNoteDocument` 已是"只包含传入的非空章节"。本次由 ExportMenu **按结构只传选定章节**实现过滤——结构未选的章节即使缓存存在也不传入。NoteBuilder 本身无需改动。

## 8. 国际化

新增 key（10 locale，zh-CN/en 实译，其余 en 占位）：
- `options.labels.exportTarget` / `options.labels.exportStructure`
- 导出目标选项：Notion / Obsidian（可复用现有）
- 导出结构 4 选项文案
- `exportMenu` 新 toast：`needConfigNotion` / `needConfigObsidian`（或复用 `needConfig`）、`generating`（正在生成缺失章节…）、`needAsr`（无字幕需先 ASR）、`needAiConfig`（请先配置 AI 模型）

## 9. 错误处理

- 目标未配置 → 打开设置页 + toast。
- AI 未配置（生成时）→ toast 引导去设置。
- 前置缺失（无字幕 / 无评论样本）→ 列入 `missing`，toast 引导，导出其余可用章节；若可用章节为空 → "暂无可导出"。
- 生成中网络/接口错误 → toast 通用失败。

## 10. 测试策略

- 纯函数/服务单测：
  - 结构 → 章节集合映射。
  - `ensureSections`：mock `cacheService` + 注入 mock 生成器，验证"命中缓存不重生成"、"未命中则生成并缓存"、"前置缺失列入 missing 不抛 ASR"。
- 设置页/ExportMenu UI 改动无 RTL 环境，由真机 MCP 走查覆盖（目标切换显示对应配置、未配置点导出打开设置页、按结构导出、缺失章节自动补生成）。

## 11. 范围外 / 后续

- 无字幕时在导出流程内自动 ASR（本次明确不做，引导用户手动）。
- Notion OAuth 后端、database 父对象（沿用前一 spec 的后续项）。
- 导出结构的更细粒度自定义（如单独导评论）。
