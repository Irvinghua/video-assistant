# Video AI Assistant · 视频 AI 助手

> 🌐 **Language / 语言**: **[English](#english)** | **[中文](#中文)**

A Chrome extension that summarizes long videos and analyzes their comment sections with AI — read 30 minutes of video in 1 minute. Works on **YouTube**, **Bilibili**, and **Douyin (抖音)**.

There are plenty of video-summary tools out there, but this is the **most complete video-to-text assistant** yet. It doesn't just help you get the gist of a video faster — it makes knowledge capture effortless: the **full transcript**, the **AI summary**, and the **viewers' opinions from the comment section** can all be synced to your **Notion / Obsidian / Markdown** notes with a single click, **without ever leaving the video page**. And it works even when the original video has **no built-in subtitles**.

---

## English

### 1. Features

- **AI Video Summary** — generates a one-line gist, timestamped chapters (click a timestamp to jump in the player), and a condensed full digest.
- **Comment Sentiment Insight** — samples top-liked and most-debated comments, then produces a "public-opinion report": consensus, divergences, and the gap between what the creator said and what viewers took away.
- **Mind Map** — auto-builds an interactive mind map of the video's logical structure.
- **Ask AI** — chat with the video: ask follow-up questions about anything mentioned in it.
- **Subtitle & ASR** — prefers the platform's official captions; falls back to AI speech-to-text (Whisper) when none exist.
- **Export / Knowledge Capture** — one-click export to **Notion**, **Obsidian**, or a **Markdown** file. Choose which sections to include: transcript, summary, comment analysis, mind map.
- **Multi-provider AI** — bring your own API key for OpenAI, Anthropic (Claude), Gemini, Grok, Qwen, DeepSeek, Z.AI, MiniMax, or Ollama Cloud.
- **10 UI languages** — Simplified Chinese, English, हिन्दी, Español, العربية, Français, Português, Bahasa Indonesia, 日本語, 한국어 (with RTL layout for Arabic). AI output follows the UI language.

### 2. Installation

> Currently distributed **only as an offline ZIP package** via GitHub Releases. It is **not** on the Chrome Web Store yet.

1. Go to the [**Releases**](../../releases) page and download the latest `video-assistant-vX.X.X.zip`.
2. Unzip it to a folder you will keep (deleting the folder removes the extension).
3. Open Chrome and visit `chrome://extensions`.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the unzipped folder.
6. The Video AI Assistant icon should now appear in your toolbar.

### 3. Usage

1. **Configure your AI key** — click the extension icon → open **Options/Settings**, pick an AI provider and paste your API key. (Optionally configure a separate key for ASR.)
2. **Open a video** on YouTube, Bilibili, or Douyin.
3. A toggle button appears on the page; click it to open the **sidebar** on the right.
4. In the sidebar, switch between tabs:
   - **Summary** — generate the gist, chapters, and digest.
   - **Comments** — generate the public-opinion report.
   - **Mind Map** — view the interactive map.
   - **Ask AI** — type questions about the video.
5. Use the **Export** menu to send the result to Notion / Obsidian / Markdown.
6. Switch language anytime via the globe icon at the top of the sidebar, or in Settings.

> Generated results are cached. After switching languages, clear the cache and regenerate to get output in the new language.

### 4. License

This project is released under the **[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)**.

- ✅ **Free for personal, non-commercial use** — anyone may use, copy, modify, and share it for free.
- ❌ **No commercial use** — you may not sell it, use it in a paid product/service, or otherwise use it for commercial advantage.

In short: it's open and free for everyone to use, but not for others to commercialize. See the [`LICENSE`](LICENSE) file for the full text.

---

## 中文

一款用 AI 为长视频生成文字总结、并洞察评论区舆论的 Chrome 插件 —— 1 分钟读懂 30 分钟的视频。支持 **YouTube**、**哔哩哔哩**、**抖音**。

视频总结工具实在太多，而这是目前为止**视频转文本信息最全面**的一款插件。它不仅能缩短你通过视频快速获取信息的时间，还能帮你便捷地进行知识沉淀：将**视频原稿**、**AI 总结**、**评论区网民意见**，全部在**不离开视频页面**的情况下，一键同步到你的 **Notion / Obsidian / Markdown** 离线文本中。并且，即使原视频**没有原始字幕**，本插件依然能正常工作。

### 1. 功能介绍

- **AI 视频总结** —— 生成一句话简介、带时间戳的分段章节（点击时间戳可跳转到播放器对应位置）、以及全文精简稿。
- **评论区舆论洞察** —— 抽样高赞评论与争议评论，输出一份「舆情全景报告」：核心共识、主要分歧，以及「创作者表达」与「观众接收」之间的信息落差。
- **思维导图** —— 自动根据视频逻辑生成可交互的思维导图。
- **对话式提问（Ask AI）** —— 针对视频内容追问任何细节。
- **字幕与语音转写（ASR）** —— 优先抓取平台官方字幕；若无字幕则调用 AI 语音转文字（Whisper）。
- **导出 / 知识沉淀** —— 一键导出到 **Notion**、**Obsidian** 或 **Markdown** 文件，可自选包含的章节：视频原稿、视频总结、评论总结、思维导图。
- **多模型支持** —— 自带 API Key 即可使用 OpenAI、Anthropic（Claude）、Gemini、Grok、通义千问、DeepSeek、Z.AI、MiniMax、Ollama Cloud。
- **10 种界面语言** —— 简体中文、English、हिन्दी、Español、العربية、Français、Português、Bahasa Indonesia、日本語、한국어（阿拉伯语支持 RTL 布局）。AI 输出语言跟随界面语言。

### 2. 安装方法

> 目前**仅支持从 GitHub Releases 下载 ZIP 包离线安装**，**暂未上架** Chrome 应用商店。

1. 打开 [**Releases**](../../releases) 页面，下载最新的 `video-assistant-vX.X.X.zip`。
2. 解压到一个会长期保留的文件夹（删除该文件夹即等于卸载插件）。
3. 在 Chrome 中打开 `chrome://extensions`。
4. 打开右上角的 **开发者模式**。
5. 点击 **加载已解压的扩展程序**，选择刚才解压出的文件夹。
6. 工具栏上应出现「视频 AI 助手」图标。

### 3. 使用方法

1. **配置 AI 密钥** —— 点击插件图标 → 打开 **设置页**，选择 AI 服务商并填入 API Key。（如需 ASR，可单独配置 ASR 的 Key。）
2. 在 YouTube、哔哩哔哩或抖音上**打开一个视频**。
3. 页面上会出现一个开关按钮，点击它即可在右侧打开**侧边栏**。
4. 在侧边栏中切换标签页：
   - **视频总结** —— 生成简介、章节和精简稿。
   - **评论分析** —— 生成舆情全景报告。
   - **思维导图** —— 查看可交互导图。
   - **Ask AI** —— 输入问题向视频提问。
5. 使用 **导出** 菜单把结果发送到 Notion / Obsidian / Markdown。
6. 随时通过侧边栏顶部的地球图标，或设置页切换语言。

> 生成的结果会被缓存。切换语言后，请先「清除缓存」再重新生成，即可得到新语言的内容。

### 4. 使用协议

本项目基于 **[PolyForm Noncommercial License 1.0.0（非商业许可）](https://polyformproject.org/licenses/noncommercial/1.0.0/)** 发布。

- ✅ **个人、非商业用途免费** —— 任何人都可以免费使用、复制、修改和分享。
- ❌ **禁止商业使用** —— 不得售卖，不得用于付费产品/服务，不得以任何方式用于商业牟利。
