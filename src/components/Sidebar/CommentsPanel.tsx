import { useVideo } from "../../contexts/VideoContext"
import { useCommentAnalysis } from "../../hooks/useCommentAnalysis"
import { useApiKeyStatus } from "../../hooks/useApiKeyStatus"
import { useTranslation } from "../../i18n/useTranslation"
import { ConfigurePrompt } from "../ConfigurePrompt"

const HEAT_STYLES: Record<string, string> = {
    extreme: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
}

export function CommentsPanel() {
    const { sampledComments, cachedData } = useVideo()
    const { analysis, loading, error, handleAnalyze } = useCommentAnalysis()
    const { hasChatKey } = useApiKeyStatus()
    const { t } = useTranslation()

    if (!hasChatKey) return <ConfigurePrompt kind="chat" />

    const sampledTotal =
        (sampledComments?.consensus.length ?? 0) + (sampledComments?.controversial.length ?? 0)

    const effectiveAnalysis = analysis ?? cachedData.comments

    if (sampledComments === null && !cachedData.comments) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mb-2"></div>
                <p className="text-gray-500 text-sm">{t("comments.fetching")}</p>
            </div>
        )
    }

    if (!effectiveAnalysis && !loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <p className="text-sm text-gray-500 mb-2 text-center">
                    {t("comments.sampledStats", {
                        total: sampledTotal,
                        consensus: sampledComments?.consensus.length ?? 0,
                        controversial: sampledComments?.controversial.length ?? 0
                    })}
                </p>
                <p className="text-xs text-gray-400 mb-4 text-center">{t("comments.analysisHint")}</p>
                <button
                    onClick={handleAnalyze}
                    disabled={sampledTotal === 0}
                    className="px-6 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-medium"
                >
                    {t("comments.analyzeBtn")}
                </button>
                {error && <p className="text-red-500 mt-2 text-sm text-center whitespace-pre-wrap">{error}</p>}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mb-2"></div>
                <p className="text-gray-500 text-sm">{t("comments.analyzing")}</p>
            </div>
        )
    }

    const { consensus, divergences, gap, mood, spotlight } = effectiveAnalysis!

    return (
        <div className="p-4 space-y-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base border-b pb-2">{t("comments.reportTitle")}</h3>

            {/* Mood keywords */}
            {mood && mood.length > 0 && (
                <section className="flex flex-wrap gap-2">
                    {mood.map((m, i) => (
                        <span
                            key={i}
                            className="bg-gradient-to-r from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 text-pink-700 dark:text-pink-300 px-3 py-1 rounded-full font-medium"
                            style={{ fontSize: "13px" }}
                        >
                            #{m}
                        </span>
                    ))}
                </section>
            )}

            {/* Consensus */}
            <section>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-s-4 border-green-500 ps-2" style={{ fontSize: "14px" }}>{t("comments.sections.consensus")}</h3>
                <div className="space-y-2">
                    {consensus?.map((c, i) => (
                        <div
                            key={i}
                            className="bg-green-50/60 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-3 rounded-lg flex justify-between items-start gap-3"
                        >
                            <p className="text-gray-800 dark:text-gray-200 flex-1" style={{ fontSize: "14px", lineHeight: "1.7" }}>{c.point}</p>
                            <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${HEAT_STYLES[c.heat] ?? HEAT_STYLES.medium}`} style={{ fontSize: "12px" }}>
                                {t("comments.heatLabel", { level: t(`comments.heat.${c.heat}`) })}
                            </span>
                        </div>
                    ))}
                    {(!consensus || consensus.length === 0) && (
                        <p className="text-sm text-gray-400 italic">{t("comments.noConsensus")}</p>
                    )}
                </div>
            </section>

            {/* Divergences */}
            <section>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-s-4 border-orange-500 ps-2" style={{ fontSize: "14px" }}>{t("comments.sections.divergences")}</h3>
                <div className="space-y-3">
                    {divergences?.map((d, i) => (
                        <div
                            key={i}
                            className="bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 p-3 rounded-lg"
                        >
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2" style={{ fontSize: "14px" }}>{d.topic}</h4>
                            <div className="space-y-1.5 mb-2">
                                <div className="text-gray-700 dark:text-gray-300" style={{ fontSize: "14px", lineHeight: "1.7" }}>
                                    <span className="font-semibold text-green-700 dark:text-green-400">{t("comments.sideA")} </span>
                                    {d.sideA}
                                </div>
                                <div className="text-gray-700 dark:text-gray-300" style={{ fontSize: "14px", lineHeight: "1.7" }}>
                                    <span className="font-semibold text-red-700 dark:text-red-400">{t("comments.sideB")} </span>
                                    {d.sideB}
                                </div>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 italic border-t border-orange-100 dark:border-orange-900/30 pt-1.5" style={{ fontSize: "13px", lineHeight: "1.6" }}>
                                {t("comments.rootCause")} {d.rootCause}
                            </p>
                        </div>
                    ))}
                    {(!divergences || divergences.length === 0) && (
                        <p className="text-sm text-gray-400 italic">{t("comments.noDivergence")}</p>
                    )}
                </div>
            </section>

            {/* Gap */}
            {gap && (gap.hit || gap.miss) && (
                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-s-4 border-blue-500 ps-2" style={{ fontSize: "14px" }}>{t("comments.sections.gap")}</h3>
                    <div className="space-y-2">
                        {gap.hit && (
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-3 rounded-lg">
                                <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1 uppercase" style={{ fontSize: "12px" }}>{t("comments.hit")}</p>
                                <p className="text-gray-800 dark:text-gray-200" style={{ fontSize: "14px", lineHeight: "1.7" }}>{gap.hit}</p>
                            </div>
                        )}
                        {gap.miss && (
                            <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 p-3 rounded-lg">
                                <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1 uppercase" style={{ fontSize: "12px" }}>{t("comments.miss")}</p>
                                <p className="text-gray-800 dark:text-gray-200" style={{ fontSize: "14px", lineHeight: "1.7" }}>{gap.miss}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Spotlight */}
            {spotlight && spotlight.length > 0 && (
                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-s-4 border-yellow-500 ps-2" style={{ fontSize: "14px" }}>{t("comments.sections.spotlight")}</h3>
                    <div className="space-y-2">
                        {spotlight.map((s, i) => (
                            <p
                                key={i}
                                className="text-gray-700 dark:text-gray-300 italic border-s-2 border-yellow-400 dark:border-yellow-600 ps-3 py-1"
                                style={{ fontSize: "14px", lineHeight: "1.7" }}
                            >
                                "{s}"
                            </p>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
