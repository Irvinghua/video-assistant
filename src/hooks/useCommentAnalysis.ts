import { useState, useEffect } from "react"
import type { CommentAnalysis, SummaryResult } from "../services/ai/types"
import { CommentAnalyzer } from "../services/summarizer/CommentAnalyzer"
import { VideoSummarizer } from "../services/summarizer/VideoSummarizer"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { useVideo } from "../contexts/VideoContext"

export interface UseCommentAnalysisResult {
    analysis: CommentAnalysis | null
    loading: boolean
    error: string
    handleAnalyze: () => Promise<void>
}

export function useCommentAnalysis(): UseCommentAnalysisResult {
    const { videoInfo, platform, sampledComments, subtitles, setSummaryResult } = useVideo()
    const videoId = videoInfo?.id

    const [analysis, setAnalysis] = useState<CommentAnalysis | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        setAnalysis(null)
        setError("")
        if (videoId) checkCache(videoId)
    }, [videoId])

    const checkCache = async (vId: string) => {
        const cached = await cacheService.get<CommentAnalysis>(cacheKeys.comments(platform, vId))
        if (cached) {
            console.log(`[useCommentAnalysis] Cache hit for ${vId}`)
            setAnalysis(cached)
        }
    }

    const resolveVideoOverview = async (): Promise<string> => {
        if (!videoId) throw new Error("No video detected.")

        const cachedSummary = await cacheService.get<SummaryResult>(cacheKeys.summary(platform, videoId))
        if (cachedSummary) {
            const overview = cachedSummary.fullDigest || cachedSummary.oneLiner || ""
            if (overview) return overview
        }

        if (subtitles.length === 0) {
            throw new Error("请先生成视频摘要（Summarize 或 Summarize via ASR），再分析评论。")
        }

        console.log("[useCommentAnalysis] No cached summary, generating from subtitles...")
        const generated = await new VideoSummarizer().summarize(subtitles)
        await cacheService.set(cacheKeys.summary(platform, videoId), generated)
        setSummaryResult(generated)
        return generated.fullDigest || generated.oneLiner || ""
    }

    const handleAnalyze = async () => {
        if (!videoId) return
        if (!sampledComments || (sampledComments.consensus.length === 0 && sampledComments.controversial.length === 0)) {
            setError("No comments available to analyze.")
            return
        }
        setLoading(true)
        setError("")
        try {
            const overview = await resolveVideoOverview()
            const result = await new CommentAnalyzer().analyze(sampledComments, overview)
            setAnalysis(result)
            await cacheService.set(cacheKeys.comments(platform, videoId), result, 24 * 60 * 60)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return { analysis, loading, error, handleAnalyze }
}
