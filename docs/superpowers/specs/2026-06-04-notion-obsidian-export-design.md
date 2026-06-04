# 一键导入笔记（Notion + Obsidian）设计文档

- 日期：2026-06-04
- 状态：已通过 brainstorming，待实现
- 范围：为视频总结、评论分析、思维导图增加"一键导入到 Notion / Obsidian"能力；移除 Readwise 支持。

## 1. 背景与目标

产品已具备三类可导出内容，但"知识沉淀"仅有配置占位、无实际导出逻辑：

- `SummaryResult`：`oneLiner` + `chapters[{timestamp,title,summary}]` + `fullDigest`
- `CommentAnalysis`：`consensus[]` / `divergences[]` / `gap{hit,miss}` / `mood[]` / `spotlight[]`
- 思维导图：一段 Markdown 字符串（markmap 渲染源）
- `VideoInfo`：`title` / `url` / `videoId` / `platform`（含作者/UP主）

现状：

- `src/services/export/ExportService.ts` 只把 summary 转 Markdown 并触发浏览器下载，不含评论分析与思维导图。
- `src/options.tsx` 的 Knowledge Export 区只有 `notionToken` / `readwiseToken` / `obsidianVault` 三个输入框，存入 storage 但从未被使用。
- `src/background.ts` 有 `FETCH_API` 消息代理（跨域 fetch），`host_permissions: https://*/*` 覆盖 `api.notion.com`。

目标：实现真正可用的一键导出，移除 Readwise。

## 2. 关键决策与约束

| 议题 | 决策 | 理由 |
| --- | --- | --- |
| 使用范围 | 面向普通用户、尽量零配置 | 用户指定 |
| Notion 认证 | **token 粘贴 MVP**，抽象 `NotionClient` 接口，OAuth 可插拔 | 纯扩展无法安全保管 OAuth `client_secret`；后端以后再说 |
| Notion 父对象 | **MVP 只支持父"页面"**（单个 page ID） | 最简单；database 属性写入留作后续 |
| Obsidian 写入 | **`obsidian://new` URI 直写** + 长度保护回退 | 无官方 HTTP API；零插件；URI 是核心内置能力 |
| 笔记结构 | **三类合并为一篇笔记**，三个一级标题分节 | 用户选择；便于检索 |
| 思维导图呈现 | **原生嵌套 Markdown 大纲** | Notion API 不能上传图片（仅外部 URL）；Obsidian 零插件不渲染 markmap |

## 3. 架构

导出层与抓取层完全解耦：只消费已标准化的数据结构，不感知页面 DOM。采用"结构化中间表示 + 多目标适配器"。

```
src/services/export/
├─ NoteDocument.ts      # 中间表示：title, meta, sections[]（结构化，非字符串）
├─ NoteBuilder.ts       # 纯函数：summary+comments+mindmap+videoInfo+i18n → NoteDocument
├─ renderers/
│  ├─ toMarkdown.ts     # NoteDocument → Markdown 字符串（Obsidian / 下载）
│  └─ toNotionBlocks.ts # NoteDocument → Notion block[] 数组
├─ targets/
│  ├─ ExportTarget.ts   # 接口：id / isConfigured() / export(doc)
│  ├─ NotionTarget.ts
│  ├─ ObsidianTarget.ts
│  └─ DownloadTarget.ts # 通用 .md 下载（兼 Obsidian 长度回退）
├─ NotionClient.ts      # 接口 + TokenNotionClient 实现
└─ ExportService.ts     # 编排：取数据 → NoteBuilder → 分发到选定 target
```

设计原则：

- `NoteBuilder` 产出结构化 `NoteDocument` 而非拼好的字符串；Obsidian 与 Notion 各自从同一结构源渲染，避免引入 Markdown 解析器依赖。
- 思维导图的嵌套 bullet 用一个轻量缩进解析器转成 bullet 树节点存入 `NoteDocument`（行 → 缩进深度 → 树）。
- 每个目标实现统一 `ExportTarget` 接口，新增/替换目标互不影响。

### 3.1 NoteDocument 结构（示意）

```ts
interface NoteDocument {
  title: string
  meta: { sourceUrl: string; platform: string; author?: string; exportedAt: string }
  sections: NoteSection[]   // 仅包含已生成的内容
}
interface NoteSection {
  heading: string           // 跟随 AI 输出语言，如 "视频总结"
  blocks: NoteBlock[]
}
type NoteBlock =
  | { kind: "paragraph"; text: RichText[] }
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "bullet"; text: RichText[]; children?: NoteBlock[] }  // 思维导图嵌套
type RichText = { text: string; bold?: boolean }
```

## 4. 内容 → 笔记映射

`NoteDocument`：

- **标题**：视频标题
- **元信息**：来源链接、平台、作者/UP主、导出日期
- **分节**（按当前已生成/缓存内容动态包含，缺哪节跳哪节）：
  - `## 视频总结`：一句话简介 + 分段要点（`时间戳 标题` + 小结）+ 全文精简稿
  - `## 舆情报告`：核心共识 / 主要分歧 / Gap 分析（命中/盲区）/ 氛围关键词 / 独立见解
  - `## 思维导图`：原生嵌套大纲
- 时间戳退化为纯文本（如 `12:30`），不做跳转链接（笔记内无法跳回视频，YAGNI）。

## 5. Notion 通路（token 粘贴 MVP）

- 设置项：**Integration Token** + **父页面 ID**。
- `NotionClient` 接口 + `TokenNotionClient` 实现；所有请求经 background `FETCH_API` 代理到 `api.notion.com`（带 `Authorization: Bearer <token>`、`Notion-Version` 头）。
- 在父页面下 `POST /v1/pages`（`parent: { page_id }`），children 为 `toNotionBlocks` 转出的块。
- Notion 块嵌套与单次大小有限制：分节内容过多时分批 `PATCH /v1/blocks/{id}/children` 追加（每批 ≤100 块）。
- 接口抽象到位 → 将来加 `OAuthNotionClient` 时上层零改动。

### 5.1 Markdown 富文本 → Notion 块

由 `toNotionBlocks` 从 `NoteDocument` 直接生成，支持：`heading_2/3`、`paragraph`、`bulleted_list_item`（含子项嵌套）、`bold` 注解。不支持的块类型降级为 paragraph。

## 6. Obsidian 通路（`obsidian://new` 直写 + 长度保护）

- 设置项：**Vault 名称**（obsidian:// 用 vault 名，非路径——现有 `obsidianVault` 字段语义需变更）+ 可选**目标文件夹**。
- 构造 `obsidian://new?vault=<name>&file=<folder/标题>&content=<encodeURIComponent(markdown)>`，`window.open` 唤起。
- **长度保护**：URI 受 OS 命令行长度限制。当 `content` 编码后超过安全阈值（约 8KB）→ 自动将全文复制到剪贴板 + 回退触发 `.md` 下载，toast 提示。
- 协议为 fire-and-forget，无法探知写入结果 → 成功态仅提示"已唤起 Obsidian"。
- 文件名/路径需做非法字符清洗（`/ \ : * ? " < > |`）。

## 7. UI / UX

- 单个导出入口置于 Sidebar 顶部工具栏：一个"导出"按钮 → 下拉菜单列出目标（导入到 Notion / 导入到 Obsidian / 下载 .md）。
- 未配置目标置灰，点击引导"前往设置"。
- 导出时按当前已生成/缓存内容组装；三类全空则禁用并提示先生成。
- 设置页 Knowledge Export 区：删除 Readwise 输入框；Notion 增加父页面 ID 字段；Obsidian 字段改为 vault 名 + 文件夹；各加简短引导文案。

## 8. 国际化

- 10 个 locale：移除 `readwiseToken` 相关 key；新增父页面 ID、vault 名、文件夹、导出菜单项、各 toast 与错误文案的 key。
- 笔记内分节标题随 AI 输出语言，与现有 i18n 一致。

## 9. 错误处理

- Notion：401（token 无效）/ 404（父页面未找到或未共享给 integration）/ 429（限流）→ 各自明确 toast。
- Obsidian：超长按 §6 回退；vault 名为空引导去设置。
- 缺内容：只导已生成的；全空拦截。

## 10. 测试策略

- 纯函数单测：`NoteBuilder`、`toMarkdown`、`toNotionBlocks`、思维导图缩进解析、Obsidian 长度判定与文件名清洗。
- 目标层：`NotionClient` mock，验证请求体与分批逻辑；`ObsidianTarget` 验证 URI 构造与回退分支。

## 11. 范围外 / 后续

- Notion OAuth 后端（接口已留口）
- Notion 父对象支持 database 及属性写入
- 思维导图 PNG/SVG 图片导出；Obsidian 端 ```markmap 代码块开关
- 自动补生成缺失内容
- 更新/去重已存在的笔记（当前每次新建）
- Readwise（本次移除）
