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
Summarize this partial video transcript.
CRITICAL: Keep the original [MM:SS] timestamps for key events.

Transcript Part ${index + 1}:
${chunk}

IMPORTANT: Write the entire summary in ${language}, regardless of the language used in these instructions or the transcript.`,

    /**
     * Final structured summary from merged chunk summaries.
     */
    finalSummary: (combinedSummary: string, language = "Chinese") =>
        `Based on the following intermediate summaries of a video (which contain timestamps), generate a final structured summary in ${language}.

Intermediate Summaries:
${combinedSummary}

Output EXCLUSIVELY in valid JSON format (no markdown fences, no explanation, just the JSON object):
{
  "oneLiner": "A single sentence summary of the whole video",
  "chapters": [
    { "timestamp": number_of_seconds, "title": "Short title", "summary": "Brief summary of this section" }
  ],
  "fullDigest": "A detailed 500-1000 word summary of the video content"
}

For "timestamp" in "chapters", convert the [MM:SS] format back to total seconds (e.g., [1:30] becomes 90).
Make sure the chapters reflect the logical structure of the video.
Do NOT wrap the JSON in markdown code fences.
IMPORTANT: Write EVERY string value (oneLiner, each chapter title and summary, fullDigest) in ${language}, regardless of the language used in these instructions or the transcript.`,

    /**
     * Deep analysis of video comment samples against the video's own overview.
     * `samplesJson` carries two pools: consensusPool (top-hot L1) and
     * controversialThreads (high-dispute L1 with their top L2 replies).
     */
    analyzeComments: (videoScript: string, samplesJson: string, language = "Chinese") =>
        `Role: You are a senior social-media analyst who excels at distilling group psychology and public opinion by comparing fragmented comments against the source video.

[Video Transcript]
${videoScript}

[Curated Comment Samples (JSON)]
- consensusPool: top-liked first-level comments ordered by heat — they represent the majority consensus.
- controversialThreads: high-dispute first-level comments, each with topReplies (high-liked second-level replies) showing divergence or debate.

${samplesJson}

Task: Combine the video transcript with the comment samples to perform a deep consensus / divergence analysis.
Requirements:
- Consensus extraction: list opinions that are repeatedly echoed and heavily upvoted (heat = extreme | high | medium reflects supporting heat).
- Divergence dissection: for each controversial thread or any cross-thread opposing topic, distill the core arguments of side A and side B, and identify the root cause (video logic flaw / stance bias / cognitive gap / factual dispute, etc.).
- The Gap: compare against the transcript — point out what the comments hit (hit) and what the video did not cover but commenters discuss heavily, or what the video emphasizes but viewers ignore (miss).
- Mood: summarize the comment-section mood with 3 keywords.
- Spotlight: extract 1-2 high-information-gain expert comments or witty replies (quote briefly).

Output JSON ONLY (no markdown fences, no extra explanation), schema:
{
  "consensus": [{ "point": "string", "heat": "extreme" | "high" | "medium" }],
  "divergences": [{ "topic": "string", "sideA": "string", "sideB": "string", "rootCause": "string" }],
  "gap": { "hit": "string", "miss": "string" },
  "mood": ["string", "string", "string"],
  "spotlight": ["string"]
}
Output language: ${language}. Every string field above must be written in ${language}.`,

    /**
     * Summarizes a transcript chunk for mind map pre-processing.
     */
    mindmapChunkSummary: (chunk: string, language = "Chinese") =>
        `Summarize this partial video transcript concisely, keeping key points and [MM:SS] timestamps:

${chunk}

IMPORTANT: Write the summary in ${language}, regardless of the language used in these instructions or the transcript.`,

    /**
     * Generates a mind map in Markdown heading format from a transcript.
     */
    mindmap: (transcript: string, language = "Chinese") =>
        `Based on the following video transcript, generate a mind map in Markdown heading format (use #, ##, ###, - for hierarchy).
The mind map should capture the main topic, key themes, and important details.
Output ONLY the markdown, no explanation.

Transcript:
${transcript}

IMPORTANT: Write ALL headings and bullets in ${language}, regardless of the language used in these instructions or the transcript.`,
}
