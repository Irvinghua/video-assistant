# 一键导入笔记（Notion + Obsidian）设计文档

- 日期：2026-06-04（2026-06-05 修订 Obsidian 方案）
- 状态：已实现并真机验证（下载 .md ✓、Obsidian 剪贴板方案 ✓）；Notion 通路待用户填 token+父页面 ID 后验证
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
| Obsidian 写入 | **剪贴板 + `obsidian://new?...&clipboard=true`**（修订，见 §6） | 无官方 HTTP API；零插件；正文走系统剪贴板，URL 不带正文 → 无长度限制 |
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

**嵌套深度上限（修订 2026-06-05）**：Notion API **单次请求最多允许 2 层嵌套子块**（顶层块 → 子 → 孙，孙必须是叶子；再深的 `children` 会被拒，返回 `400 validation_error`）。思维导图是 `#/##/###/-` 的深树，原样转换会超限导致整次导出失败（表现为「导出失败」）。因此 `toNotionBlocks` 把原生嵌套**封顶在 Notion 上限**（depth 0/1 原生嵌套，孙级为叶子）；更深的层级**拍平到孙级、并在文本前加缩进前缀**以保留层次可读性。Markdown/Obsidian 渲染无此限制，仅 Notion 渲染器需要。已用真机 Notion API 验证：拍平后的负载返回 200。

## 6. Obsidian 通路（剪贴板 + `obsidian://new?...&clipboard=true`）

> **修订说明（2026-06-05）**：初版采用 `obsidian://new?...&content=<整篇markdown>` 的 URI 直写 + 8KB 长度回退。实测发现该方案不可靠——即便不足 2000 字的笔记，`content=` 编码后也会触碰 OS/URL 长度上限而失败。改为下述**剪贴板方案**：正文不进 URL，因此**无任何长度限制**。

- 设置项：**Vault 名称**（obsidian:// 用 vault 名，非路径——现有 `obsidianVault` 字段语义需变更）+ 可选**目标文件夹**。
- 实现逻辑（`ObsidianTarget.export`）：
  1. 由 `toMarkdown(NoteDocument)` 生成整篇 Markdown。
  2. **静默写入系统剪贴板**：先试 `navigator.clipboard.writeText`，失败则回退 `document.execCommand("copy")`（临时 textarea）。因为处理函数在写剪贴板前 `await` 了缓存读取，原始点击手势的 transient activation 可能已失效，execCommand 路径不依赖它，更稳。
  3. 构造**极短**链接 `obsidian://new?vault=<name>&file=<folder/标题>&clipboard=true`（纯函数 `buildObsidianUri`，正文**不**进 URL），用隐藏 `<a>` 点击唤起（避免 `window.open` 残留空白页）。
  4. Obsidian 识别核心内置参数 `clipboard=true` 后，自动读取系统剪贴板大文本填入新建笔记。
- **权限**：manifest 增加 `clipboardWrite`，保障 execCommand 复制稳定（清单变更需重载扩展才生效；实测仅刷新页面、权限未激活时剪贴板写入也已可用，该权限为冗余保险）。
- **回退**：仅当剪贴板写入彻底失败（两条路径都抛错）才退到 `.md` 下载，toast 提示"剪贴板不可用，已改为下载文件"。**不再有按长度回退的逻辑**。
- 协议为 fire-and-forget，无法探知写入结果 → 成功态提示"已唤起 Obsidian"。
- 文件名/路径需做非法字符清洗（`/ \ : * ? " < > |`）。
- 参考：[Obsidian URI 官方文档](https://obsidian.md/help/uri)，`clipboard` 为 `new` 动作的核心内置参数，无需任何社区插件。

## 7. UI / UX

- 单个导出入口置于 Sidebar 顶部工具栏：一个"导出"按钮 → 下拉菜单列出目标（导入到 Notion / 导入到 Obsidian / 下载 .md）。
- 未配置目标置灰，点击引导"前往设置"。
- 导出时按当前已生成/缓存内容组装；三类全空则提示先生成。
  - **数据来源（修订 2026-06-05）**：`ExportMenu` 在点击导出时直接读 `cacheService.getBatch([summary,comments,mindmap])` 实时缓存，**不**读 `VideoContext.cachedData`。原因：`cachedData` 仅在页面加载时填充一次，本会话内现场生成的内容（由各 panel hook 写入 `cacheService`）不会反映到它，否则会误判"暂无可导出"。
- 设置页 Knowledge Export 区：删除 Readwise 输入框；Notion 增加父页面 ID 字段；Obsidian 字段改为 vault 名 + 文件夹；各加简短引导文案。

## 8. 国际化

- 10 个 locale：移除 `readwiseToken` 相关 key；新增父页面 ID、vault 名、文件夹、导出菜单项、各 toast 与错误文案的 key。
- 笔记内分节标题随 AI 输出语言，与现有 i18n 一致。

## 9. 错误处理

- Notion：401（token 无效）/ 404（父页面未找到或未共享给 integration）/ 429（限流）→ 各自明确 toast。
- Obsidian：剪贴板写入彻底失败才回退 `.md` 下载（§6）；vault 名为空时 `isConfigured` 为 false，由 `ExportService.exportTo` 抛 `TARGET_NOT_CONFIGURED` → 引导去设置。
- 缺内容：只导已生成的；全空拦截。

## 10. 测试策略

- 纯函数单测：`NoteBuilder`、`toMarkdown`、`toNotionBlocks`、思维导图缩进解析（含 tab/4 空格）、文件名清洗。
- 目标层：`NotionClient` mock，验证请求体、100 块分批、401/404/429 错误映射；`ObsidianTarget` 验证 `buildObsidianUri`（含 `clipboard=true`、无 `content=`、vault 空格编码、文件夹/标题清洗）。剪贴板写入与协议唤起为 DOM 副作用，不做单测，由真机 MCP 走查覆盖。

## 11. 范围外 / 后续

- Notion OAuth 后端（接口已留口）
- Notion 父对象支持 database 及属性写入
- 思维导图 PNG/SVG 图片导出；Obsidian 端 ```markmap 代码块开关
- 自动补生成缺失内容
- 更新/去重已存在的笔记（当前每次新建）
- Readwise（本次移除）
