/**
 * Centralized AI prompt templates.
 * All prompt strings live here to ensure consistent behavior across the app.
 */

export const Prompts = {
    /**
     * Summarizes a chunk of a video transcript, preserving timestamps.
     */
    chunkSummary: (chunk: string, index: number, language = "Chinese") =>
        `You are a professional video content summarizer.
Summarize this partial video transcript in ${language}.
CRITICAL: Keep the original [MM:SS] timestamps for key events.

Transcript Part ${index + 1}:
${chunk}`,

    /**
     * Final structured summary from merged chunk summaries.
     */
    finalSummary: (combinedSummary: string, language = "Chinese") =>
        `Based on the following intermediate summaries of a video (which contain timestamps), generate a final structured summary in ${language}.

Intermediate Summaries:
${combinedSummary}

Output EXCLUSIVELY in valid JSON format:
{
  "oneLiner": "A single sentence summary of the whole video",
  "chapters": [
    { "timestamp": number_of_seconds, "title": "Short title", "summary": "Brief summary of this section" }
  ],
  "fullDigest": "A detailed 500-1000 word summary of the video content"
}

For "timestamp" in "chapters", convert the [MM:SS] format back to total seconds (e.g., [1:30] becomes 90).
Make sure the chapters reflect the logical structure of the video.`,

    /**
     * Deep analysis of video comment samples against the video's own overview.
     * `samplesJson` carries two pools: consensusPool (top-hot L1) and
     * controversialThreads (high-dispute L1 with their top L2 replies).
     */
    analyzeComments: (videoOverview: string, samplesJson: string) =>
        `角色：你是一位深度社交媒体分析师，擅长从碎片化评论中通过对比视频本体内容，提炼群体心理与舆论风向。

【视频核心摘要】
${videoOverview}

【精选评论样本（JSON）】
- consensusPool：按热度排序的高赞一级评论，代表大多数共识。
- controversialThreads：争议指数高的一级评论，每条附带 topReplies（高赞二级回复），体现分歧或辩论。

${samplesJson}

任务：结合视频核心摘要与评论样本，做深度的共识与分歧分析。
要求：
- 共识提取：列出若干被反复提及且点赞极高的观点（heat=extreme/high/medium 表示支撑热度）。
- 分歧解剖：针对 controversialThreads 中的每条线程或跨线程的对立话题，提炼 A 派与 B 派核心论点，并判断分歧根源（视频逻辑缺陷 / 立场偏见 / 认知差异 / 事实争议 等）。
- 信息偏离度 (The Gap)：对比视频摘要，指出评论命中的主内容 (hit)，以及视频未覆盖但评论热议的话题 / 被观众忽视的视频重点 (miss)。
- 舆情氛围 (mood)：用 3 个中文关键词概括评论区情绪。
- 独立见解 (spotlight)：提取 1-2 条高信息增量的专业评论或神回复（引用原文，简短）。

仅输出 JSON（不要 markdown 包裹，不要额外解释），schema：
{
  "consensus": [{ "point": "string", "heat": "extreme" | "high" | "medium" }],
  "divergences": [{ "topic": "string", "sideA": "string", "sideB": "string", "rootCause": "string" }],
  "gap": { "hit": "string", "miss": "string" },
  "mood": ["string", "string", "string"],
  "spotlight": ["string"]
}
输出语言：中文。`,

    /**
     * Summarizes a transcript chunk for mind map pre-processing.
     */
    mindmapChunkSummary: (chunk: string) =>
        `Summarize this partial video transcript concisely, keeping key points and [MM:SS] timestamps:\n\n${chunk}`,

    /**
     * Generates a mind map in Markdown heading format from a transcript.
     */
    mindmap: (transcript: string) =>
        `Based on the following video transcript, generate a mind map in Markdown heading format (use #, ##, ###, - for hierarchy).
The mind map should capture the main topic, key themes, and important details.
Use Chinese if the content is in Chinese, otherwise match the content language.
Output ONLY the markdown, no explanation.

Transcript:
${transcript}`,
}
