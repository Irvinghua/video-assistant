import { useState, useEffect } from "react"
import type { CommentAnalysis } from "../services/ai/types"
import { CommentAnalyzer } from "../services/summarizer/CommentAnalyzer"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { useVideo } from "../contexts/VideoContext"

export interface UseCommentAnalysisResult {
    analysis: CommentAnalysis | null
    loading: boolean
    error: string
    handleAnalyze: () => Promise<void>
}

export function useCommentAnalysis(): UseCommentAnalysisResult {
    const { videoInfo, platform, comments } = useVideo()
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

    const handleAnalyze = async () => {
        if (!comments.length) { setError("No comments available to analyze."); return }
        setLoading(true)
        setError("")
        try {
            const result = await new CommentAnalyzer().analyze(comments)
            setAnalysis(result)
            if (videoId) {
                await cacheService.set(cacheKeys.comments(platform, videoId), result, 24 * 60 * 60)
            }
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return { analysis, loading, error, handleAnalyze }
}
