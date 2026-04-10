import { useState, useEffect, useRef } from "react"
import { AIServiceFactory } from "../services/ai/AIServiceFactory"
import { ASRServiceFactory } from "../services/asr/ASRServiceFactory"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { Prompts } from "../services/ai/prompts"
import { chunkText } from "../utils/textChunker"
import type { SubtitleSegment } from "../services/platform/types"
import { useVideo } from "../contexts/VideoContext"

export type MindMapASRStep = "idle" | "getting_url" | "downloading" | "transcribing" | "generating"

export interface UseMindMapResult {
    markdown: string | null
    loading: boolean
    checkingCache: boolean
    error: string
    asrStep: MindMapASRStep
    checkCacheAndGenerate: () => Promise<void>
    handleDigitalASR: () => Promise<void>
}

export function useMindMap(isActive: boolean): UseMindMapResult {
    const { videoInfo, platform, subtitles, service } = useVideo()
    const videoId = videoInfo?.id

    const [markdown, setMarkdown] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [checkingCache, setCheckingCache] = useState(false)
    const [error, setError] = useState("")
    const [asrStep, setAsrStep] = useState<MindMapASRStep>("idle")
    const currentVideoIdRef = useRef(videoId)

    // Reset on video change
    useEffect(() => {
        currentVideoIdRef.current = videoId
        setMarkdown(null)
        setError("")
        setAsrStep("idle")
    }, [videoId])

    // Auto-generate when tab becomes active or subtitles arrive
    useEffect(() => {
        if (!isActive || !videoId) return
        if (markdown || loading || checkingCache) return
        checkCacheAndGenerate()
    }, [isActive, videoId, markdown, loading, checkingCache, subtitles.length])

    const generateMindMap = async (subs: SubtitleSegment[]) => {
        if (!videoId || subs.length === 0) return
        setLoading(true)
        setError("")
        try {
            const aiService = await AIServiceFactory.getService()
            const textWithTime = subs.map(s => {
                const m = Math.floor(s.start / 60)
                const sec = Math.floor(s.start % 60)
                return `[${m}:${sec.toString().padStart(2, '0')}] ${s.text}`
            }).join("\n")

            const chunks = chunkText(textWithTime, 3000)
            let combinedText = textWithTime
            if (chunks.length > 1) {
                const summaries = await Promise.all(
                    chunks.map(chunk => aiService.chat([{ role: "user", content: Prompts.mindmapChunkSummary(chunk) }]))
                )
                combinedText = summaries.join("\n\n")
            }

            const result = await aiService.chat([{ role: "user", content: Prompts.mindmap(combinedText) }])
            if (currentVideoIdRef.current !== videoId) return

            const cleaned = result.replace(/^```(?:markdown)?\n?/m, "").replace(/\n?```$/m, "").trim()
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

    const checkCacheAndGenerate = async () => {
        if (!videoId) return
        setCheckingCache(true)
        try {
            const cached = await cacheService.get<string>(cacheKeys.mindmap(platform, videoId))
            if (currentVideoIdRef.current !== videoId) return
            if (cached) {
                console.log(`[useMindMap] Cache hit for ${videoId}`)
                setMarkdown(cached)
                return
            }
            if (subtitles.length > 0) await generateMindMap(subtitles)
        } catch (e) {
            console.error("[useMindMap] Cache check error:", e)
        } finally {
            setCheckingCache(false)
        }
    }

    const handleDigitalASR = async () => {
        if (!videoId || asrStep !== "idle") return
        setError("")
        setAsrStep("getting_url")
        try {
            const audioUrl = await service.getAudioUrl(videoId)
            if (!audioUrl) throw new Error("This video does not support digital extraction.")
            setAsrStep("downloading")
            const response: any = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "FETCH_AUDIO", url: audioUrl }, resolve)
            })
            if (!response?.success) throw new Error(response?.error || "Failed to download audio.")
            const binaryString = atob(response.data)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
            const audioBlob = new Blob([bytes], { type: "audio/mp4" })
            setAsrStep("transcribing")
            const transcript = await (await ASRServiceFactory.getService()).transcribe(audioBlob)
            if (!transcript) throw new Error("Transcription result is empty.")
            setAsrStep("generating")
            await generateMindMap([{ start: 0, end: 0, text: transcript }])
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setAsrStep("idle")
        }
    }

    return { markdown, loading, checkingCache, error, asrStep, checkCacheAndGenerate, handleDigitalASR }
}
