import { useState, useEffect, useRef } from "react"
import type { SummaryResult } from "../services/ai/types"
import type { SubtitleSegment } from "../services/platform/types"
import { VideoSummarizer } from "../services/summarizer/VideoSummarizer"
import { ExportService } from "../services/export/ExportService"
import { transcribeLongAudio } from "../services/asr/ASRPipeline"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { useVideo } from "../contexts/VideoContext"
import { useI18n } from "../i18n/I18nProvider"

export type ASRStep = "idle" | "getting_url" | "downloading" | "transcribing" | "summarizing"

export interface UseSummaryResult {
    summary: SummaryResult | null
    loading: boolean
    error: string
    asrStep: ASRStep
    handleSummarize: (subs: SubtitleSegment[]) => Promise<void>
    handleDigitalASR: () => Promise<void>
    handleExport: () => void
    handleClearCache: () => Promise<void>
}

/**
 * Download audio directly from content-script context. SW fetches cannot
 * set Referer (Chrome strips forbidden headers), and Bilibili CDN rejects
 * cross-origin credentialed requests (ACAO:* conflicts with credentials).
 * So we fetch from the page origin with credentials omitted, matching how
 * the native <video> player sources each segment — `upsig` authenticates
 * the URL, cookies aren't needed.
 */
async function downloadAudio(urls: string[]): Promise<Blob> {
    const errors: string[] = []
    for (const url of urls) {
        try {
            const res = await fetch(url, { credentials: "omit" })
            if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
            return await res.blob()
        } catch (e) {
            errors.push(`${url.substring(0, 80)}: ${(e as Error).message}`)
            console.warn(`[useSummary] Candidate failed, trying next: ${(e as Error).message}`)
        }
    }
    throw new Error(`All ${urls.length} audio URLs failed. Last errors:\n${errors.join("\n")}`)
}

async function resolveAudioUrls(service: any, videoId: string): Promise<string[]> {
    if (typeof service.getAudioUrlCandidates === "function") {
        const list = await service.getAudioUrlCandidates(videoId)
        if (list?.length) return list
    }
    const single = await service.getAudioUrl(videoId)
    return single ? [single] : []
}

export function useSummary(): UseSummaryResult {
    const { videoInfo, platform, service, setSubtitles, setSummaryResult, cachedData } = useVideo()
    const { t, aiLanguage } = useI18n()
    const videoId = videoInfo?.id

    const [summary, setSummary] = useState<SummaryResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [asrStep, setAsrStep] = useState<ASRStep>("idle")
    const currentVideoIdRef = useRef(videoId)

    // Hydrate from batch-loaded cache
    useEffect(() => {
        currentVideoIdRef.current = videoId
        setError("")
        setAsrStep("idle")
        if (cachedData.summary) {
            setSummary(cachedData.summary)
            setSummaryResult(cachedData.summary)
        } else {
            setSummary(null)
        }
    }, [videoId, cachedData.summary])

    const handleSummarize = async (targetSubs: SubtitleSegment[]) => {
        if (!targetSubs.length) { setError(t("summary.errors.noContent")); return }
        setLoading(true)
        setError("")
        try {
            const result = await new VideoSummarizer().summarize(targetSubs, aiLanguage)
            if (currentVideoIdRef.current === videoId) {
                setSummary(result)
                setSummaryResult(result)
                await cacheService.set(cacheKeys.summary(platform, videoId!), result)
            }
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleDigitalASR = async () => {
        if (!videoId || asrStep !== "idle") return
        setError("")
        setAsrStep("getting_url")
        try {
            const urls = await resolveAudioUrls(service, videoId)
            if (urls.length === 0) throw new Error(t("summary.errors.noAudio"))

            setAsrStep("downloading")
            const audioBlob = await downloadAudio(urls)
            console.log(`[useSummary] Audio downloaded: ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB, type=${audioBlob.type}`)

            setAsrStep("transcribing")
            const result = await transcribeLongAudio(audioBlob, (p) => {
                if (p.phase === "transcribing" && p.total) {
                    console.log(`[useSummary] Transcribing chunk ${p.current}/${p.total}`)
                }
            })
            if (!result.text) throw new Error(t("summary.errors.transcriptionEmpty"))

            const asrSubs: SubtitleSegment[] = result.segments.length > 0
                ? result.segments
                : [{ start: 0, end: 0, text: result.text }]
            setSubtitles(asrSubs)

            // Cache ASR subtitles
            const subKey = cacheKeys.subtitle(platform, videoId)
            const existing = await cacheService.get<SubtitleSegment[]>(subKey)
            if (!existing) {
                await cacheService.set(subKey, asrSubs)
                console.log(`[useSummary] Cached ASR subtitles for ${videoId}`)
            }

            setAsrStep("summarizing")
            await handleSummarize(asrSubs)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setAsrStep("idle")
        }
    }

    const handleExport = () => {
        if (!summary) return
        const content = ExportService.toMarkdown(summary, "Video Summary", window.location.href)
        ExportService.download(content, "summary.md")
    }

    const handleClearCache = async () => {
        if (!videoId) return
        try {
            await cacheService.remove(cacheKeys.summary(platform, videoId))
            setSummary(null)
            setSummaryResult(null)
            setError(t("summary.cacheClearedToast"))
            setTimeout(() => setError(""), 3000)
        } catch (e) {
            console.error("[useSummary] Failed to clear cache", e)
        }
    }

    return { summary, loading, error, asrStep, handleSummarize, handleDigitalASR, handleExport, handleClearCache }
}
