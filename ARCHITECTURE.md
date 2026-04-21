# Video AI Assistant — 架构设计说明

> Chrome MV3 扩展，为 YouTube / Bilibili 提供 AI 视频摘要、评论舆情分析、思维导图和对话问答。

---

## 目录

1. [技术框架](#1-技术框架)
2. [整体架构](#2-整体架构)
3. [代码结构](#3-代码结构)
4. [功能技术实现思路](#4-功能技术实现思路)
5. [状态管理与缓存](#5-状态管理与缓存)
6. [跨域通信机制](#6-跨域通信机制)
7. [构建与打包](#7-构建与打包)
8. [调试方案](#8-调试方案)
9. [国际化（i18n）](#9-国际化i18n)

---

## 1. 技术框架

### 核心框架

| 框架 / 库 | 版本 | 用途 |
|---|---|---|
| [Plasmo](https://docs.plasmo.com/) | 0.90.5 | Chrome MV3 扩展构建框架，自动生成 manifest、entry points |
| React | 18.2.0 | 侧边栏 / 弹窗 UI 框架 |
| TypeScript | 5.3.3 | 类型安全 |
| Tailwind CSS | 3.4.17 | Utility-first 样式 |
| Framer Motion | 12.x | 侧边栏动画 |

### 主要依赖

| 库 | 用途 |
|---|---|
| `@plasmohq/storage` | Chrome local storage 封装，管理用户配置 |
| `markmap-lib / markmap-view / markmap-toolbar` | 思维导图 Markdown 解析与 SVG 渲染 |
| `lucide-react` | 图标 |
| `idb` | IndexedDB 封装（备用存储） |
| `uuid` | 生成唯一 ID |

### 开发工具

- **Prettier + prettier-plugin-sort-imports**：代码格式化 + import 排序
- **PostCSS + autoprefixer**：CSS 处理管线
- **pnpm**：包管理器

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome 浏览器                           │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Background Worker   │    │    Content Script (页面)     │  │
│  │  (background.ts)     │◄──►│  youtube.tsx / bilibili.tsx  │  │
│  │                      │    │                              │  │
│  │  • 跨域 Fetch 代理   │    │  ┌──────────────────────┐   │  │
│  │  • 音频下载          │    │  │ Shadow DOM 侧边栏     │   │  │
│  │  • YouTube字幕提取   │    │  │ ┌──────────────────┐ │   │  │
│  └──────────────────────┘    │  │ │  VideoContext     │ │   │  │
│                              │  │ │  (全局视频状态)   │ │   │  │
│  ┌──────────────────────┐    │  │ ├──────────────────┤ │   │  │
│  │  Popup (popup.tsx)   │    │  │ │  Tabs UI         │ │   │  │
│  │  • 快速入口          │    │  │ │  Summary         │ │   │  │
│  └──────────────────────┘    │  │ │  Comments        │ │   │  │
│                              │  │ │  Ask AI          │ │   │  │
│  ┌──────────────────────┐    │  │ │  MindMap         │ │   │  │
│  │  Options (options)   │    │  │ └──────────────────┘ │   │  │
│  │  • API Keys          │    │  └──────────────────────┘   │  │
│  │  • AI 模型选择       │    └──────────────────────────────┘  │
│  │  • ASR 配置          │                                      │
│  │  • 缓存管理          │           ▲ AI API / ASR API         │
│  └──────────────────────┘           │ (Gemini / OpenAI / ...)  │
└────────────────────────────────────────────────────────────────┘
```

### 扩展入口点

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/background.ts` | Service Worker | 后台常驻，处理特权操作 |
| `src/popup.tsx` | Popup | 点击扩展图标弹出的小窗 |
| `src/options.tsx` | Options Page | 设置页面 |
| `src/contents/youtube.tsx` | Content Script | 注入 YouTube 页面 |
| `src/contents/bilibili.tsx` | Content Script | 注入 Bilibili 页面 |

---

## 3. 代码结构

```
src/
├── background.ts                    # Service Worker：跨域代理 / 音频下载 / 字幕提取
├── popup.tsx                        # Popup 入口 UI
├── options.tsx                      # 扩展设置页（API Key、ASR、缓存等）
├── style.css                        # 全局样式（Tailwind 基础样式）
│
├── contents/
│   ├── youtube.tsx                  # YouTube 内容脚本
│   └── bilibili.tsx                 # Bilibili 内容脚本
│
├── i18n/
│   ├── index.ts                    # 语言常量、检测、normalize、RTL 判断
│   ├── I18nProvider.tsx            # React Context Provider，跨上下文同步语言
│   ├── useTranslation.ts           # 简化 hook：返回 { t, locale, dir }
│   └── locales/                    # 10 份字典：en / zh-CN / hi / es / ar / fr / pt / id / ja / ko
│       └── *.json
│
├── components/
│   ├── ToggleButton.tsx             # 浮动开关按钮（右下角）
│   ├── LanguageSwitcher.tsx         # 语言切换器（compact 用于侧边栏，full 用于设置页）
│   └── Sidebar/
│       ├── index.tsx                # 侧边栏主体：Tab 导航 + VideoProvider
│       ├── SummaryPanel.tsx         # 视频摘要面板
│       ├── CommentsPanel.tsx        # 评论舆情面板
│       ├── AskAIPanel.tsx           # AI 对话面板
│       └── MindMapPanel.tsx         # 思维导图面板
│
├── contexts/
│   └── VideoContext.tsx             # 全局视频状态（字幕、评论、摘要、seekTo）
│
├── hooks/
│   ├── useSummary.ts                # 摘要生成逻辑（含 ASR 回退）
│   ├── useCommentAnalysis.ts        # 评论分析逻辑
│   └── useMindMap.ts                # 思维导图生成逻辑
│
├── services/
│   ├── ai/
│   │   ├── AIServiceFactory.ts      # AI 服务工厂（按选中模型返回实现）
│   │   ├── BaseAIService.ts         # 抽象基类（summarize / analyzeComments）
│   │   ├── OpenAIService.ts         # OpenAI 兼容接口（ChatGPT、Grok、Qwen 等）
│   │   ├── ClaudeService.ts         # Anthropic Claude API
│   │   ├── GeminiService.ts         # Google Gemini API
│   │   ├── prompts.ts               # 所有 AI Prompt 模板
│   │   └── types.ts                 # ChatMessage / SummaryResult / CommentAnalysis
│   │
│   ├── asr/
│   │   ├── ASRServiceFactory.ts     # ASR 服务工厂
│   │   ├── WhisperService.ts        # 远端 Whisper 接口（OpenAI / Groq / 通义等）
│   │   └── types.ts
│   │
│   ├── platform/
│   │   ├── PlatformFactory.ts       # 根据 URL 返回 YouTube 或 Bilibili 服务
│   │   ├── types.ts                 # VideoInfo / SubtitleSegment / Comment / IPlatformService
│   │   ├── youtube/
│   │   │   ├── YouTubeService.ts    # YouTube 平台服务
│   │   │   ├── subtitleFetcher.ts   # DOM 抓取字幕（点击字幕按钮 + 滚动收集）
│   │   │   └── commentFetcher.ts    # InnerTube /youtubei/v1/next（无需 API key）
│   │   └── bilibili/
│   │       ├── BilibiliService.ts   # Bilibili 平台服务
│   │       ├── subtitleFetcher.ts   # WBI 签名 + CC 字幕 API
│   │       └── commentFetcher.ts    # Bilibili 评论 API（分页）
│   │
│   ├── cache/
│   │   ├── CacheService.ts          # Chrome local storage 缓存，含 videoId 隔离
│   │   └── types.ts
│   │
│   ├── export/
│   │   └── ExportService.ts         # 摘要导出为 Markdown 文件
│   │
│   └── summarizer/
│       ├── VideoSummarizer.ts       # 多段落字幕分块 → 分段摘要 → 合并最终 JSON
│       └── CommentAnalyzer.ts       # 评论聚合文本 → AI 分析
│
├── utils/
│   └── textChunker.ts               # 文本按 token 分块（~4000 字符 / 块）
│
└── types/
    └── markmap.d.ts                 # markmap 类型补丁
```

---

## 4. 功能技术实现思路

### 4.1 视频摘要生成

**技术路径**

```
用户打开侧边栏
  → VideoContext 检测当前平台与视频 ID
  → 拉取字幕 (SubtitleSegment[])
  → 若字幕存在：VideoSummarizer 处理
      1. textChunker 按 ~4000 字符分块
      2. 对每块调用 AI chunkSummary prompt（保留时间戳）
      3. 将所有块摘要拼接，调用 AI finalSummary prompt
      4. 返回结构化 JSON：{ oneLiner, chapters[], fullDigest }
  → CacheService 以 "platform:videoId:summary" 为键缓存 3 天
  → SummaryPanel 展示，章节时间戳可点击 seekTo()
  → 若字幕不存在：展示 ASR 按钮（见 4.4）
```

**时间戳保留机制**

- 字幕格式化时在每行前加 `[MM:SS]` 前缀
- Chunk 摘要 Prompt 要求保留时间戳
- Final Prompt 要求将时间戳转为秒数，输出 `{ time: number }` 字段

---

### 4.2 YouTube 字幕抓取

YouTube 不提供公开的字幕 API，采用两步方案：

1. **DOM 触发**：在 `ytd-watch-metadata` 中找到"内容转文字"按钮并点击，等待字幕面板展开
2. **滚动收集**：循环 `scrollTop += 800`，等待渲染，用 `querySelectorAll("transcript-segment-view-model")` 读取段落，直到连续 3 轮无新增为止
3. **去重排序**：以 `start|text` 为 key 去重，按时间戳排序
4. **面板关闭**：采集完成后自动关闭字幕面板

---

### 4.3 Bilibili 字幕 / 评论获取

- **WBI 签名**：Bilibili API 要求对参数进行 MD5 哈希签名（`wts` + `w_rid`），从 `nav` 接口获取 `img_key` 和 `sub_key`
- **字幕 API**：通过 `/x/player/wbi/v2` 获取字幕列表，选择人工字幕（非 AI 生成），下载 JSON 字幕文件
- **评论 API**：`/x/v2/reply` 接口分页拉取，通过 Background Worker 携带 Referer 头发送请求（规避 CORS）

---

### 4.4 数字音频提取 + ASR（无字幕回退）

```
用户点击 "Summarize via ASR"
  → asrStep 状态机：idle → getting_url → downloading → transcribing → generating
  → PlatformService.getAudioUrl()
      • YouTube：返回 null（不支持）
      • Bilibili：通过 playurl API 获取 DASH 音频流 URL
  → Background Worker 下载音频 Blob → 转 base64 → 返回 Content Script
  → Content Script 解码为 Blob
  → WhisperService 上传到远端 ASR API（OpenAI / Groq / 通义等）
  → 返回文字稿，进入 VideoSummarizer 流程
```

---

### 4.5 评论舆情分析

```
用户切换到 Comments Tab
  → useCommentAnalysis 检测 comments 数组非空
  → CommentAnalyzer.analyze(comments)
      1. 格式化：[likes 赞] 用户名: 内容
      2. 调用 AI analyzeComments prompt
      3. 返回 JSON：{ sentiment, clusters[], controversies[] }
  → CacheService 缓存 24 小时
  → CommentsPanel 渲染情感分布条 + 话题聚类卡片 + 争议点
```

---

### 4.6 思维导图生成

```
用户切换到 MindMap Tab
  → useMindMap 检测 subtitles 非空，自动触发
  → 分块字幕 → 块摘要（同摘要流程）
  → 调用 AI mindmap prompt，生成 Markdown 层级结构（# / - 格式）
  → 清理 ``` 代码围栏
  → CacheService 缓存 markdown
  → MindMapPanel 渲染：
      markmap-lib Transformer.transform(md) → AST root
      Markmap.create(svgRef) + setData(root)
      setTimeout 300ms 后 fit() + 适配深色模式文字色
```

---

### 4.7 AI 对话（Ask AI）

- 首次对话将视频字幕（前 20,000 字符）注入为系统上下文
- 多轮对话维护 `ChatMessage[]` 历史
- `AIService.chat(messages)` 透传完整历史，保持上下文连续性
- 支持 8 种 AI 提供商，统一 OpenAI-like 接口格式

---

### 4.8 多 AI 提供商支持

通过工厂模式实现，从 storage 读取 `selectedModel`，返回对应实例：

| 提供商 | 实现类 | API 格式 |
|---|---|---|
| ChatGPT / Grok / Qwen / GLM / Kimi / DeepSeek | `OpenAIService` | OpenAI-compatible |
| Claude | `ClaudeService` | Anthropic API（system 消息分离） |
| Gemini | `GeminiService` | Google Gemini API（消息格式转换） |

---

### 4.9 国际化（i18n）

UI 与 AI 输出均跟随同一份用户语言设置流转，详见 [§9 国际化（i18n）](#9-国际化i18n)。

---

## 5. 状态管理与缓存

### 5.1 存储层次

| 层 | 机制 | 用途 |
|---|---|---|
| React State | `useState` / `useContext` | 临时 UI 状态（Tab、加载标志、聊天消息） |
| `@plasmohq/storage` | Chrome `local` storage | 用户配置（API Key、模型、ASR 配置） |
| `CacheService` | Chrome `local` storage | 视频摘要 / 评论分析 / 思维导图 缓存（含 TTL） |

### 5.2 缓存 Key 设计

```
格式：{platform}:{videoId}:{type}
示例：youtube:dQw4w9WgXcQ:summary
      bilibili:BV1GJ411x7h7:mindmap
```

### 5.3 VideoID 隔离（防缓存污染）

缓存条目中内嵌 `videoId` 字段，读取时二次校验，不匹配则视为无效缓存，防止切换视频后展示上一个视频的内容。

---

## 6. 跨域通信机制

### Content Script ↔ Background Worker

通过 `chrome.runtime.sendMessage` 传递消息：

| 消息类型 | 触发方 | 处理方 | 场景 |
|---|---|---|---|
| `FETCH_API` | Content Script | Background | Bilibili API（需携带 Cookie/Referer） |
| `FETCH_YOUTUBE_SUBTITLES` | Content Script | Background | YouTube 字幕（MAIN world 读 `ytInitialPlayerResponse`） |
| `FETCH_AUDIO` | Content Script | Background | 音频下载 → base64 返回 |

### Shadow DOM 隔离

Content Script 通过 Plasmo 注入到 Shadow DOM 中（`host-id: video-assistant-youtube`），样式隔离，避免与页面 CSS 冲突。

---

## 7. 构建与打包

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 8

### 安装依赖

```bash
pnpm install
```

### 开发模式（推荐调试使用）

```bash
pnpm dev
```

- 输出目录：`build/chrome-mv3-dev/`
- 支持热重载（修改源码后自动更新）
- 在 Chrome 扩展管理页（`chrome://extensions/`）开启开发者模式，加载 `build/chrome-mv3-dev/` 目录

### 生产构建

```bash
pnpm build
```

- 输出目录：`build/chrome-mv3-prod/`
- 代码压缩优化
- 打包产物可直接提交到 Chrome Web Store

### Plasmo 构建原理

Plasmo 自动处理：
- **入口发现**：`popup.tsx` → popup.html，`options.tsx` → options.html，`background.ts` → service worker，`contents/*.tsx` → content scripts
- **Manifest 生成**：根据代码中的 `PlasmoCSConfig` 导出（`matches`、`run_at` 等）自动填充 `manifest.json`
- **图标处理**：`assets/icon.png` 自动生成 16/32/48/64/128 多尺寸版本
- **样式处理**：Tailwind CSS + PostCSS 管线

### 关键 Manifest 权限

```json
{
  "permissions": ["storage", "cookies", "scripting"],
  "host_permissions": ["https://*/*"]
}
```

### 构建产物结构

```
build/chrome-mv3-dev/
├── manifest.json
├── popup.html
├── options.html
├── background.js          # Service Worker
├── contents/
│   ├── youtube.js
│   └── bilibili.js
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 8. 调试方案

### 8.1 优先手段：Chrome DevTools MCP（强烈推荐）

本机已配置 `chrome-devtools` MCP，连接到运行在 **127.0.0.1:9223** 的 Chrome 实例（远程调试端口）。Claude 可通过该 MCP 直接读取页面状态、控制台与网络，**并可自动重载插件**，**无需人工搬运报错日志，也无需用户手动点 reload**。

#### 关键常量

| 常量 | 值 |
|---|---|
| **EXTENSION_ID**（dev 模式，本机固定） | `aianhbkiaienofmmcpcennbnobabpalo` |
| 远程调试端口 | `127.0.0.1:9223` |
| dev 构建产物 | `build/chrome-mv3-dev/` |

#### 一次性启动准备（每个调试 session 开始前）

| 项 | 谁负责 | 说明 |
|---|---|---|
| Chrome 以 `--remote-debugging-port=9223` 启动 | 用户 | 一次性，已配置 |
| `pnpm dev` 在某个终端**常驻运行** | 用户 | **启动一次即可**，它是 watcher，会自动增量编译。**Claude 不要去调用 `pnpm dev` / `pnpm build`** |
| `build/chrome-mv3-dev/` 已加载到 `chrome://extensions/` | 用户 | 一次性 |

#### 每轮调试循环（改一处代码 = 一轮，全程 Claude 自主完成）

```
1. Claude 修改源码
   → pnpm dev watcher 自动增量编译到 build/chrome-mv3-dev/

2. Claude 用 ls 验证编译已落地（替代任何 pnpm 调用）
   ls -lt build/chrome-mv3-dev/static/background/index.js \
          build/chrome-mv3-dev/youtube.*.js \
          build/chrome-mv3-dev/bilibili.*.js
   → mtime 是刚才的时间 ⇒ 编译完成 ✅

3. Claude 通过 MCP 重载插件（见下方"自动 reload 标准动作"）
4. Claude 通过 MCP 刷新当前视频页（让 content script 重新注入）
5. Claude 通过 MCP 自取自查（list_console_messages / list_network_requests / evaluate_script ...）
```

→ 用户在整轮中通常**不需要做任何事**，只需告知"开始验证 XX 视频的 YY 功能"。

#### 自动 reload 标准动作（替代手动点 chrome://extensions/）

```
# A. 重载整个插件（影响 background / popup / options / manifest 时必做）
mcp__chrome-devtools__new_page
  url: "chrome-extension://aianhbkiaienofmmcpcennbnobabpalo/options.html"
mcp__chrome-devtools__evaluate_script
  function: "() => chrome.runtime.reload()"
# 注意：reload 后该 options 页会断连，下次调用前先 list_pages 重新定位

# B. 让 content script 重新注入到目标视频页
mcp__chrome-devtools__list_pages          # 找到视频页
mcp__chrome-devtools__select_page
mcp__chrome-devtools__navigate_page       # 重新加载该页 URL
```

#### 按改动范围决定执行哪些动作

| 改动位置 | 需要做什么 |
|---|---|
| `src/contents/*.tsx` 及被其引用的 `components/hooks/services` | 通常 Plasmo HMR 自动处理；Claude **只需** B（刷新视频页）确认效果 |
| `src/background.ts` | 必须 A + B |
| `src/popup.tsx` / `src/options.tsx` | A，然后重新打开对应 popup / options 页 |
| manifest 相关（权限、`PlasmoCSConfig.matches`、`run_at`、新增入口） | 必须 A + B |

> 💡 不确定 HMR 是否生效时，直接做 A + B 也无害——是个安全默认值。

#### Claude 可用的 MCP 工具集（按调试场景）

| 场景 | 工具 |
|---|---|
| 重载插件 | `mcp__chrome-devtools__new_page`（开 extension 页）+ `evaluate_script`（`chrome.runtime.reload()`）|
| 切换/打开/刷新视频页 | `mcp__chrome-devtools__list_pages` / `select_page` / `navigate_page` |
| 读取报错与日志 | `mcp__chrome-devtools__list_console_messages` / `get_console_message` |
| 检查 API 请求 | `mcp__chrome-devtools__list_network_requests` / `get_network_request` |
| 验证页面状态 | `mcp__chrome-devtools__evaluate_script`（可调用挂载在 `window` 上的调试出口） |
| 查看 Shadow DOM 渲染 | `mcp__chrome-devtools__take_screenshot` / `take_snapshot` |
| 模拟交互 | `mcp__chrome-devtools__click` / `type_text` / `wait_for` |
| 性能问题 | `mcp__chrome-devtools__performance_start_trace` / `stop_trace` / `analyze_insight` |

#### 典型调试场景示例

- *字幕抓取失败* → MCP 读 console 报错 + `evaluate_script` 检查 `ytd-watch-metadata` 是否存在 + 网络面板看字幕请求响应
- *Bilibili WBI 签名错误* → `list_network_requests` 过滤 `wbi`，对比 `wts` / `w_rid` 参数
- *AI 请求异常* → 网络面板查 OpenAI/Claude/Gemini 接口的 status 与响应体
- *侧边栏未渲染* → `take_snapshot` 看 Shadow DOM 树 + console 报错

### 8.2 复杂度排序：选最低成本的方法

按"我需要验证什么"决定调试手段：

1. **纯函数 / 数据转换**（如 `textChunker`、WBI 签名、字幕去重排序、`VideoSummarizer` 合并逻辑）
   → 用 vitest + fixture 在 Node 端单测，**完全脱离浏览器**
2. **AI Prompt 迭代**（修 `prompts.ts`、调摘要质量）
   → 保存一份真实字幕 / 评论 fixture，写 Node 脚本直跑 service 层，避免每次走完整 UI 流程
3. **平台抓取 / DOM 解析 / 跨域 / UI 渲染 / 端到端流程**
   → 走 §8.1 Chrome DevTools MCP 调试循环

### 8.3 调试出口约定（可选增强）

为了让 MCP 的 `evaluate_script` 用得更顺手，建议在 content script 与 background 中按需挂载调试出口（仅 `pnpm dev` 模式下注入），例如：

```ts
if (process.env.NODE_ENV !== "production") {
  (window as any).__VA_DEBUG__ = {
    getSubtitles: () => videoContext.subtitles,
    getComments: () => videoContext.comments,
    runSummarizer: (fixture) => summarizer.run(fixture),
    dumpCache: () => cacheService.dump(),
  }
}
```

这样 Claude 一行 `evaluate_script` 即可复现内部状态，不需要每次走完整 UI。

### 8.4 反模式（不要这么做）

- ❌ Claude 主动调用 `pnpm dev` / `pnpm build` 来"触发编译" —— watcher 已在用户终端常驻，重复调用只会起多余进程
- ❌ 用 `pnpm build`（生产构建，输出到 `chrome-mv3-prod/`）做调试 —— 无 source map、无 HMR、目录都不对
- ❌ 让用户手动到 `chrome://extensions/` 点 reload —— 改完代码后 Claude 应通过 §8.1 的"自动 reload 标准动作"自行完成
- ❌ 让用户手动复制 console 报错粘贴给 Claude —— 直接走 §8.1 MCP
- ❌ 在浏览器里手动验证纯函数逻辑 —— 应由单测覆盖
- ❌ reload 后忘记刷新视频页 —— content script 不会重新注入，相当于没生效
- ❌ 改完代码就让用户立即去测 —— 先用 `ls -lt build/chrome-mv3-dev/...` 确认 watcher 已编译完，再走 reload + 自验

---

---

## 9. 国际化（i18n）

### 9.1 设计目标

| 目标 | 实现 |
|---|---|
| 支持 10 种 UI 语言 | `src/i18n/locales/*.json`：en / zh-CN / hi / es / ar / fr / pt / id / ja / ko |
| 首次安装自动选语言 | `detectBrowserLocale()` 读取 `navigator.languages`，loose match 后回退英文 |
| 全表面同步切换 | `@plasmohq/storage` 的 `useStorage` 触发 `chrome.storage.onChanged`，sidebar / popup / options 立即重新渲染 |
| AI 输出跟随 UI 语言 | `AI_LANGUAGE_NAMES[locale]` 提供英文形态的语言名（"Modern Standard Arabic"），注入 prompt |
| 阿拉伯语 RTL | `RTL_LOCALES` + `<div dir={dir} lang={locale}>` + Tailwind logical 属性 |
| 不打扰旧缓存 | 已生成内容仍按原语言显示；用户主动清缓存后再生成才换语言 |

### 9.2 模块结构

```
src/i18n/
├── index.ts            # SUPPORTED_LOCALES / LANGUAGE_DISPLAY_NAMES (本地名 → 下拉显示)
│                       # AI_LANGUAGE_NAMES (英文名 → 注入 AI prompt)
│                       # detectBrowserLocale / normalizeLocale / isRTL / getDirection
│                       # LOCALE_STORAGE_KEY = "userLanguage"
├── I18nProvider.tsx    # Context Provider，提供 { locale, setLocale, t, dir, aiLanguage }
├── useTranslation.ts   # 简化 hook，只返回 { t, locale, dir }
└── locales/<locale>.json
```

### 9.3 调用链

```
浏览器语言 / 用户切换
   │
   ▼
useStorage("userLanguage") ── (chrome.storage.local) ──► 跨上下文广播
   │
   ▼
I18nProvider 计算 locale + dir + aiLanguage
   │
   ├─► UI：useTranslation().t("summary.title") → 字符串渲染
   ├─► 布局：<div dir="rtl" lang="ar"> 包裹整棵子树
   └─► AI：useI18n().aiLanguage → 透传到 hooks
            ├─► useSummary    → VideoSummarizer.summarize(subs, aiLanguage)
            │                    → Prompts.chunkSummary / finalSummary(text, language)
            ├─► useCommentAnalysis → CommentAnalyzer.analyze(sampled, script, aiLanguage)
            │                         → IAIService.analyzeComments(..., language)
            │                           → Prompts.analyzeComments(..., language)
            ├─► useMindMap    → Prompts.mindmapChunkSummary / mindmap(text, aiLanguage)
            └─► AskAIPanel    → context += "Respond in {aiLanguage}."
```

### 9.4 Provider 挂载点

| 入口 | 文件 | 备注 |
|---|---|---|
| Popup | `src/popup.tsx` | 顶层包裹 `<I18nProvider>` |
| Options | `src/options.tsx` | 顶层 `OptionsPage` 包裹 `<I18nProvider>` |
| YouTube content | `src/contents/youtube.tsx` | Shadow DOM 内层包裹 |
| Bilibili content | `src/contents/bilibili.tsx` | 同上 |

### 9.5 Locale 检测与归一化

`normalizeLocale(input)` 处理 BCP-47 简化匹配：

```
"zh-Hant-HK" → "zh-CN"   // 所有 zh-* 当前都归一到 zh-CN（产品级简化）
"pt-BR"      → "pt"      // 葡语合并
"ar-EG"      → "ar"      // 阿语合并
"fr-CA"      → "fr"
"en-US"      → "en"
"th"         → null      // 不支持，回退英文
```

`detectBrowserLocale()`：按 `navigator.languages` 顺序遍历，命中第一个支持项即返回，全部不命中则 `"en"`。

### 9.6 LanguageSwitcher 两种形态

| variant | 用途 | 视觉 |
|---|---|---|
| `compact` | 侧边栏 header | 地球图标 + locale code（如 `EN`/`中文`/`عربية`），点击弹出列表 |
| `full` | 设置页「语言」区块 | 原生 `<select>`，选项展示原生名称（English / 简体中文 / 日本語 / ...） |

### 9.7 RTL 支持

- `RTL_LOCALES = new Set(["ar"])`
- 所有侧边栏组件已替换为 logical CSS：`ms-`/`me-`、`ps-`/`pe-`、`border-s-`/`border-e-`
- 切换到阿拉伯语时整棵子树 `dir="rtl"`，Tailwind 自动镜像

### 9.8 添加新语言的步骤

1. `src/i18n/index.ts`：在 `SUPPORTED_LOCALES`、`LANGUAGE_DISPLAY_NAMES`、`AI_LANGUAGE_NAMES` 各加一项；如为 RTL，加入 `RTL_LOCALES`。
2. `src/i18n/locales/<locale>.json`：复制 `en.json` 全文翻译，保持 `{{count}} / {{id}} / {{provider}}` 等插值变量原样。
3. `I18nProvider.tsx`：在文件顶部 import 新字典并加入 `DICTIONARIES`。
4. （可选）若 `normalizeLocale` 需要新的 loose-match 规则，同步补全。
5. 重新加载插件即可——无需改动任何 UI 组件。

---

*文档生成时间：2026-04-13*
*调试章节更新：2026-04-14*
*i18n 章节添加：2026-04-17*
