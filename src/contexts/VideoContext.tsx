import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../services/platform/types"
import type { SummaryResult, CommentAnalysis } from "../services/ai/types"
import { cacheService, cacheKeys } from "../services/cache/CacheService"

export interface VideoCacheSnapshot {
    summary: SummaryResult | null
    comments: CommentAnalysis | null
    mindmap: string | null
    sampledComments: SampledComments | null
}

interface VideoContextValue {
    service: IPlatformService
    platform: string
    videoInfo: VideoInfo | null
    subtitles: SubtitleSegment[]
    sampledComments: SampledComments | null
    dataLoading: boolean
    summaryResult: SummaryResult | null
    cachedData: VideoCacheSnapshot
    setSubtitles: (subs: SubtitleSegment[]) => void
    setSummaryResult: (result: SummaryResult | null) => void
    seekTo: (seconds: number) => void
}

const EMPTY_CACHE: VideoCacheSnapshot = { summary: null, comments: null, mindmap: null, sampledComments: null }

const VideoContext = createContext<VideoContextValue | null>(null)

export function useVideo(): VideoContextValue {
    const ctx = useContext(VideoContext)
    if (!ctx) throw new Error("useVideo must be used within VideoProvider")
    return ctx
}

interface VideoProviderProps {
    service: IPlatformService
    isOpen: boolean
    navKey?: string | number
    children: ReactNode
}

export function VideoProvider({ service, isOpen, navKey, children }: VideoProviderProps) {
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
    const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([])
    const [sampledComments, setSampledComments] = useState<SampledComments | null>(null)
    const [dataLoading, setDataLoading] = useState(true)
    const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null)
    const [cachedData, setCachedData] = useState<VideoCacheSnapshot>(EMPTY_CACHE)

    const platform = service.getPlatformName()

    const emptySampled: SampledComments = { consensus: [], controversial: [] }

    const loadData = useCallback(async (videoId: string) => {
        setDataLoading(true)
        try {
            // Fetch subtitles first — UI unblocks as soon as subs arrive.
            const subs = await service.getSubtitles(videoId).catch(e => {
                console.error("[VideoContext] Subtitle error:", e)
                return [] as SubtitleSegment[]
            })

            if (service.detectVideo()?.id !== videoId) return

            setSubtitles(subs)
            setDataLoading(false) // UI can proceed immediately

            // Cache subtitles in background
            if (subs.length > 0) {
                const subKey = cacheKeys.subtitle(platform, videoId)
                const existing = await cacheService.get<SubtitleSegment[]>(subKey)
                if (!existing) {
                    await cacheService.set(subKey, subs)
                    console.log(`[VideoContext] Cached ${subs.length} subtitle segments for ${videoId}`)
                }
            }

            console.log(`[VideoContext] Subtitles ready for ${videoId}: ${subs.length} segments`)

            // Comments: use cache if available, otherwise fetch from platform
            const sampledKey = cacheKeys.sampledComments(platform, videoId)
            const cachedSampled = await cacheService.get<SampledComments>(sampledKey)
            if (cachedSampled) {
                setSampledComments(cachedSampled)
                console.log(`[VideoContext] Using cached comments for ${videoId}`)
            } else {
                service.getComments(videoId)
                    .then(async sampled => {
                        if (service.detectVideo()?.id === videoId) {
                            setSampledComments(sampled)
                            console.log(`[VideoContext] Comments loaded for ${videoId}: consensus=${sampled.consensus.length}, controversial=${sampled.controversial.length}`)
                            if (sampled.consensus.length + sampled.controversial.length > 0) {
                                await cacheService.set(sampledKey, sampled)
                            }
                        }
                    })
                    .catch(e => console.error("[VideoContext] Comment error:", e))
            }
        } catch (e) {
            console.error("[VideoContext] Failed to load video data", e)
            setDataLoading(false)
        }
    }, [service])

    /** Batch-read all cache types for a video in one IPC call */
    const loadCachedData = useCallback(async (videoId: string) => {
        const summaryKey = cacheKeys.summary(platform, videoId)
        const commentsKey = cacheKeys.comments(platform, videoId)
        const mindmapKey = cacheKeys.mindmap(platform, videoId)
        const sampledCommentsKey = cacheKeys.sampledComments(platform, videoId)
        const batch = await cacheService.getBatch([summaryKey, commentsKey, mindmapKey, sampledCommentsKey])
        const snapshot: VideoCacheSnapshot = {
            summary: batch[summaryKey] ?? null,
            comments: batch[commentsKey] ?? null,
            mindmap: batch[mindmapKey] ?? null,
            sampledComments: batch[sampledCommentsKey] ?? null,
        }
        setCachedData(snapshot)
        if (snapshot.summary) setSummaryResult(snapshot.summary)
        if (snapshot.sampledComments) setSampledComments(snapshot.sampledComments)
        console.log(`[VideoContext] Batch cache loaded for ${videoId}: summary=${!!snapshot.summary}, comments=${!!snapshot.comments}, mindmap=${!!snapshot.mindmap}, sampledComments=${!!snapshot.sampledComments}`)
    }, [platform])

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
                setCachedData(EMPTY_CACHE)
                loadCachedData(info.id)
            }
            loadData(info.id)
        }
    }, [isOpen, service, videoInfo?.id, navKey])

    // Listen for CACHE_CLEARED to reset
    useEffect(() => {
        const handleMessage = (message: any) => {
            if (message.type === "CACHE_CLEARED") {
                setSummaryResult(null)
                setCachedData(EMPTY_CACHE)
            }
        }
        chrome.runtime.onMessage.addListener(handleMessage)
        return () => chrome.runtime.onMessage.removeListener(handleMessage)
    }, [])

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
            cachedData,
            setSubtitles,
            setSummaryResult,
            seekTo,
        }}>
            {children}
        </VideoContext.Provider>
    )
}
