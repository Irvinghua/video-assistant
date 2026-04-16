import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../services/platform/types"
import type { SummaryResult } from "../services/ai/types"

interface VideoContextValue {
    service: IPlatformService
    platform: string
    videoInfo: VideoInfo | null
    subtitles: SubtitleSegment[]
    sampledComments: SampledComments | null
    dataLoading: boolean
    summaryResult: SummaryResult | null
    setSubtitles: (subs: SubtitleSegment[]) => void
    setSummaryResult: (result: SummaryResult | null) => void
    seekTo: (seconds: number) => void
}

const VideoContext = createContext<VideoContextValue | null>(null)

export function useVideo(): VideoContextValue {
    const ctx = useContext(VideoContext)
    if (!ctx) throw new Error("useVideo must be used within VideoProvider")
    return ctx
}

interface VideoProviderProps {
    service: IPlatformService
    isOpen: boolean
    children: ReactNode
}

export function VideoProvider({ service, isOpen, children }: VideoProviderProps) {
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([])
    const [sampledComments, setSampledComments] = useState<SampledComments | null>(null)
    const [dataLoading, setDataLoading] = useState(true)
    const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null)

    const platform = service.getPlatformName()

    const emptySampled: SampledComments = { consensus: [], controversial: [] }

    const loadData = useCallback(async (videoId: string) => {
        setDataLoading(true)
        try {
            const [subs, sampled] = await Promise.all([
                service.getSubtitles(videoId).catch(e => { console.error("[VideoContext] Subtitle error:", e); return [] as SubtitleSegment[] }),
                service.getComments(videoId).catch(e => { console.error("[VideoContext] Comment error:", e); return emptySampled })
            ])
            if (service.detectVideo()?.id === videoId) {
                setSubtitles(subs)
                setSampledComments(sampled)
                console.log(`[VideoContext] Data loaded for ${videoId}. Subs: ${subs.length}, Comments consensus=${sampled.consensus.length}, controversial=${sampled.controversial.length}`)
            }
        } catch (e) {
            console.error("[VideoContext] Failed to load video data", e)
        } finally {
            setDataLoading(false)
        }
    }, [service])

    useEffect(() => {
        if (!isOpen) return
        const info = service.detectVideo()
        if (!info) {
            console.warn("[VideoContext] No video detected")
            return
        }
        if (info.id !== videoInfo?.id || (subtitles.length === 0 && !dataLoading)) {
            console.log(`[VideoContext] Triggering loadData for ${info.id}`)
            setVideoInfo(info)
            if (info.id !== videoInfo?.id) {
                setSubtitles([])
                setSampledComments(null)
                setSummaryResult(null)
            }
            loadData(info.id)
        }
    }, [isOpen, service, videoInfo?.id])

    const seekTo = useCallback((seconds: number) => service.seekTo(seconds), [service])

    return (
        <VideoContext.Provider value={{
            service,
            platform,
            videoInfo,
            subtitles,
            sampledComments,
            dataLoading,
            summaryResult,
            setSubtitles,
            setSummaryResult,
            seekTo,
        }}>
            {children}
        </VideoContext.Provider>
    )
}
