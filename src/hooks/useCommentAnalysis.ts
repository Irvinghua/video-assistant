import { useState, useEffect } from "react"
import type { CommentAnalysis } from "../services/ai/types"
import { CommentAnalyzer } from "../services/summarizer/CommentAnalyzer"
import { cacheService, cacheKeys } from "../services/cache/CacheService"
import { getPlainScript } from "../services/cache/SubtitleScript"
import { useVideo } from "../contexts/VideoContext"
import { useI18n } from "../i18n/I18nProvider"

export interface UseCommentAnalysisResult {
    analysis: CommentAnalysis | null
    loading: boolean
    error: string
    handleAnalyze: () => Promise<void>
}

export function useCommentAnalysis(): UseCommentAnalysisResult {
    const { videoInfo, platform, sampledComments, cachedData } = useVideo()
    const { t, aiLanguage } = useI18n()
    const videoId = videoInfo?.id

    const [analysis, setAnalysis] = useState<CommentAnalysis | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // Hydrate from batch-loaded cache
    useEffect(() => {
        setError("")
        if (cachedData.comments) {
            setAnalysis(cachedData.comments)
        } else {
            setAnalysis(null)
        }
    }, [videoId, cachedData.comments])

    const handleAnalyze = async () => {
        if (!videoId) return
        if (!sampledComments || (sampledComments.consensus.length === 0 && sampledComments.controversial.length === 0)) {
            setError(t("comments.errors.noComments"))
            return
        }
        setLoading(true)
        setError("")
        try {
            const script = await getPlainScript(platform, videoId)
            if (!script) {
                throw new Error(t("comments.errors.needSubtitle"))
            }
            const result = await new CommentAnalyzer().analyze(sampledComments, script, aiLanguage)
            setAnalysis(result)
            await cacheService.set(cacheKeys.comments(platform, videoId), result)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return { analysis, loading, error, handleAnalyze }
}
