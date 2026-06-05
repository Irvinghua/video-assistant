import { useState, useEffect, useRef } from "react"
import { transcribeLongAudio } from "../services/asr/ASRPipeline"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { getPlainScript } from "../services/cache/SubtitleScript"
import { generateMindmapMarkdown } from "../services/summarizer/MindmapGenerator"
import type { SubtitleSegment } from "../services/platform/types"
import { useVideo } from "../contexts/VideoContext"
import { useI18n } from "../i18n/I18nProvider"

export type MindMapASRStep = "idle" | "getting_url" | "downloading" | "transcribing" | "generating"

export interface UseMindMapResult {
    markdown: string | null
    loading: boolean
    error: string
    asrStep: MindMapASRStep
    checkCacheAndGenerate: () => Promise<void>
    handleDigitalASR: () => Promise<void>
}

async function downloadFirstSuccess(urls: string[]): Promise<Blob> {
    const errors: string[] = []
    for (const url of urls) {
        try {
            const res = await fetch(url, { credentials: "omit" })
            if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
            return await res.blob()
        } catch (e) {
            errors.push(`${url.substring(0, 80)}: ${(e as Error).message}`)
        }
    }
    throw new Error(`All ${urls.length} audio URLs failed. Last errors:\n${errors.join("\n")}`)
}

export function useMindMap(isActive: boolean): UseMindMapResult {
    const { videoInfo, platform, subtitles, service, cachedData } = useVideo()
    const { t, aiLanguage } = useI18n()
    const videoId = videoInfo?.id

    const [markdown, setMarkdown] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [asrStep, setAsrStep] = useState<MindMapASRStep>("idle")
    const currentVideoIdRef = useRef(videoId)
    const busyRef = useRef(false)

    // Hydrate from batch-loaded cache or reset on video change
    useEffect(() => {
        currentVideoIdRef.current = videoId
        setError("")
        setAsrStep("idle")
        busyRef.current = false
        if (cachedData.mindmap) {
            setMarkdown(cachedData.mindmap)
        } else {
            setMarkdown(null)
        }
    }, [videoId, cachedData.mindmap])

    // Auto-generate when tab becomes active and subtitles are available
    useEffect(() => {
        if (!isActive || !videoId) return
        if (markdown || busyRef.current) return
        generateIfReady()
    }, [isActive, videoId, subtitles.length])

    const generateFromScript = async (script: string) => {
        if (!videoId) return
        setLoading(true)
        setError("")
        try {
            const cleaned = await generateMindmapMarkdown(script, aiLanguage)
            if (currentVideoIdRef.current !== videoId) return
            setMarkdown(cleaned)
            await cacheService.set(cacheKeys.mindmap(platform, videoId), cleaned)
            console.log(`[useMindMap] Generated and cached mindmap for ${videoId}`)
        } catch (e) {
            setError((e as Error).message)
            console.error("[useMindMap] Generation error:", e)
        } finally {
            setLoading(false)
        }
    }

    const generateIfReady = async () => {
        if (!videoId || busyRef.current) return
        busyRef.current = true
        try {
            const script = await getPlainScript(platform, videoId)
            if (currentVideoIdRef.current !== videoId) return
            if (script) {
                await generateFromScript(script)
            }
        } catch (e) {
            console.error("[useMindMap] Generate error:", e)
        } finally {
            busyRef.current = false
        }
    }

    const checkCacheAndGenerate = async () => {
        if (!videoId || busyRef.current) return
        // If already have markdown from batch cache, skip
        if (markdown) return
        await generateIfReady()
    }

    const handleDigitalASR = async () => {
        if (!videoId || asrStep !== "idle") return
        setError("")
        setAsrStep("getting_url")
        try {
            const urls: string[] = typeof (service as any).getAudioUrlCandidates === "function"
                ? await (service as any).getAudioUrlCandidates(videoId)
                : await (async () => {
                    const u = await service.getAudioUrl(videoId)
                    return u ? [u] : []
                })()
            if (urls.length === 0) throw new Error(t("mindmap.errors.noAudio"))

            setAsrStep("downloading")
            const audioBlob = await downloadFirstSuccess(urls)

            setAsrStep("transcribing")
            const result = await transcribeLongAudio(audioBlob)
            if (!result.text) throw new Error(t("summary.errors.transcriptionEmpty"))

            const asrSubs: SubtitleSegment[] = result.segments.length > 0
                ? result.segments
                : [{ start: 0, end: 0, text: result.text }]

            // Cache ASR subtitles
            const subKey = cacheKeys.subtitle(platform, videoId)
            const existingSub = await cacheService.get<SubtitleSegment[]>(subKey)
            if (!existingSub) {
                await cacheService.set(subKey, asrSubs)
                console.log(`[useMindMap] Cached ASR subtitles for ${videoId}`)
            }

            setAsrStep("generating")
            const script = asrSubs.map(s => s.text).join("\n")
            await generateFromScript(script)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setAsrStep("idle")
        }
    }

    return { markdown, loading, error, asrStep, checkCacheAndGenerate, handleDigitalASR }
}
