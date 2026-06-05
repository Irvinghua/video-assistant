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

/**
 * Ensure each selected section is available, generating + caching the ones that
 * are missing but whose prerequisites exist. Sections whose prerequisites are
 * absent (no subtitles for summary/mindmap, no sampled comments for comments)
 * are listed in `missing` and NOT generated — ASR is never triggered here.
 *
 * Throws if a selected, uncached section's generator fails (e.g. AI not
 * configured); the caller is responsible for surfacing that error.
 */
export async function ensureSections(
  sections: Set<Section>,
  inputs: SectionInputs,
  deps: EnsureDeps = defaultDeps
): Promise<EnsureResult> {
  const { platform, videoId, language, subtitles, sampledComments } = inputs
  const result: EnsureResult = { summary: null, comments: null, mindmap: null, missing: [] }

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
