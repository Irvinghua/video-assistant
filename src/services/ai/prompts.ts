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
     * Analyzes comment sentiment and clusters viewpoints.
     */
    analyzeComments: (commentsText: string) =>
        `Analyze the following comments.
Output JSON:
{
  "clusters": [{ "label": "Label", "ratio": 0.5, "examples": ["comment1"] }],
  "sentiment": { "positive": 0.8, "negative": 0.1, "neutral": 0.1 },
  "controversies": [{ "topic": "Topic", "agreed": "Agreed point", "disagreed": "Disagreed point" }]
}

Comments:
${commentsText}`,

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
