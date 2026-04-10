import { useState, useEffect, useRef } from "react"
import type { SummaryResult } from "../services/ai/types"
import type { SubtitleSegment } from "../services/platform/types"
import { VideoSummarizer } from "../services/summarizer/VideoSummarizer"
import { ExportService } from "../services/export/ExportService"
import { ASRServiceFactory } from "../services/asr/ASRServiceFactory"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { useVideo } from "../contexts/VideoContext"

export type ASRStep = "idle" | "getting_url" | "downloading" | "transcribing" | "summarizing"

export interface UseSummaryResult {
    summary: SummaryResult | null
    loading: boolean
    checkingCache: boolean
    error: string
    asrStep: ASRStep
    handleSummarize: (subs: SubtitleSegment[]) => Promise<void>
    handleDigitalASR: () => Promise<void>
    handleExport: () => void
    handleClearCache: () => Promise<void>
}

export function useSummary(): UseSummaryResult {
    const { videoInfo, platform, service, setSubtitles, setSummaryResult } = useVideo()
    const videoId = videoInfo?.id

    const [summary, setSummary] = useState<SummaryResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [checkingCache, setCheckingCache] = useState(false)
    const [error, setError] = useState("")
    const [asrStep, setAsrStep] = useState<ASRStep>("idle")
    const currentVideoIdRef = useRef(videoId)

    useEffect(() => {
        currentVideoIdRef.current = videoId
        setSummary(null)
        setError("")
        setAsrStep("idle")
        if (videoId) checkCache(videoId)
    }, [videoId])

    useEffect(() => {
        const handleMessage = (message: any) => {
            if (message.type === "CACHE_CLEARED") setSummary(null)
        }
        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [])

    const checkCache = async (vId: string) => {
        setCheckingCache(true)
        try {
            const cached = await cacheService.get<SummaryResult>(cacheKeys.summary(platform, vId))
            if (currentVideoIdRef.current === vId && cached) {
                setSummary(cached)
                setSummaryResult(cached)
            }
        } catch (e) {
            console.error("[useSummary] Cache error", e)
        } finally {
            setCheckingCache(false)
        }
    }

    const handleSummarize = async (targetSubs: SubtitleSegment[]) => {
        if (!targetSubs.length) { setError("No content available to summarize."); return }
        setLoading(true)
        setError("")
        try {
            const result = await new VideoSummarizer().summarize(targetSubs)
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
            const audioUrl = await service.getAudioUrl(videoId)
            if (!audioUrl) throw new Error("This video stream does not support digital extraction.")
            setAsrStep("downloading")
            const response = await fetch(audioUrl, {
                headers: {
                    "Referer": window.location.href,
                    "User-Agent": navigator.userAgent,
                    "Range": "bytes=0-"
                }
            })
            if (!response.ok) throw new Error(`Failed to download audio: ${response.statusText}`)
            const audioBlob = await response.blob()
            setAsrStep("transcribing")
            const transcript = await (await ASRServiceFactory.getService()).transcribe(audioBlob)
            if (!transcript) throw new Error("Transcription result is empty.")
            const asrSubs: SubtitleSegment[] = [{ start: 0, end: 0, text: transcript }]
            setSubtitles(asrSubs)
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
            setError("Cache cleared.")
            setTimeout(() => setError(""), 3000)
        } catch (e) {
            console.error("[useSummary] Failed to clear cache", e)
        }
    }

    return { summary, loading, checkingCache, error, asrStep, handleSummarize, handleDigitalASR, handleExport, handleClearCache }
}
