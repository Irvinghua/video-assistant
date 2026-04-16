import { useVideo } from "../../contexts/VideoContext"
import { useCommentAnalysis } from "../../hooks/useCommentAnalysis"

const HEAT_STYLES: Record<string, string> = {
    extreme: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
}

const HEAT_LABEL: Record<string, string> = {
    extreme: "极高",
    high: "高",
    medium: "中"
}

export function CommentsPanel() {
    const { sampledComments } = useVideo()
    const { analysis, loading, error, handleAnalyze } = useCommentAnalysis()

    const sampledTotal =
        (sampledComments?.consensus.length ?? 0) + (sampledComments?.controversial.length ?? 0)

    if (!analysis && !loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <p className="text-sm text-gray-500 mb-2 text-center">
                    已抽样 {sampledTotal} 条评论（共识 {sampledComments?.consensus.length ?? 0} + 争议 {sampledComments?.controversial.length ?? 0}）。
                </p>
                <p className="text-xs text-gray-400 mb-4 text-center">
                    分析会结合视频摘要，输出共识 / 分歧 / Gap / 氛围。
                </p>
                <button
                    onClick={handleAnalyze}
                    disabled={sampledTotal === 0}
                    className="px-6 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-medium"
                >
                    Analyze Comments
                </button>
                {error && <p className="text-red-500 mt-2 text-sm text-center whitespace-pre-wrap">{error}</p>}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mb-2"></div>
                <p className="text-gray-500 text-sm">Analyzing comments...</p>
            </div>
        )
    }

    const { consensus, divergences, gap, mood, spotlight } = analysis!

    return (
        <div className="p-4 space-y-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base border-b pb-2">📊 舆情全景报告</h3>

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
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-l-4 border-green-500 pl-2" style={{ fontSize: "14px" }}>🤝 核心共识</h3>
                <div className="space-y-2">
                    {consensus?.map((c, i) => (
                        <div
                            key={i}
                            className="bg-green-50/60 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 p-3 rounded-lg flex justify-between items-start gap-3"
                        >
                            <p className="text-gray-800 dark:text-gray-200 flex-1" style={{ fontSize: "14px", lineHeight: "1.7" }}>{c.point}</p>
                            <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${HEAT_STYLES[c.heat] ?? HEAT_STYLES.medium}`} style={{ fontSize: "12px" }}>
                                热度：{HEAT_LABEL[c.heat] ?? c.heat}
                            </span>
                        </div>
                    ))}
                    {(!consensus || consensus.length === 0) && (
                        <p className="text-sm text-gray-400 italic">暂无明显共识。</p>
                    )}
                </div>
            </section>

            {/* Divergences */}
            <section>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-l-4 border-orange-500 pl-2" style={{ fontSize: "14px" }}>⚡ 主要分歧</h3>
                <div className="space-y-3">
                    {divergences?.map((d, i) => (
                        <div
                            key={i}
                            className="bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 p-3 rounded-lg"
                        >
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2" style={{ fontSize: "14px" }}>{d.topic}</h4>
                            <div className="space-y-1.5 mb-2">
                                <div className="text-gray-700 dark:text-gray-300" style={{ fontSize: "14px", lineHeight: "1.7" }}>
                                    <span className="font-semibold text-green-700 dark:text-green-400">A 派：</span>
                                    {d.sideA}
                                </div>
                                <div className="text-gray-700 dark:text-gray-300" style={{ fontSize: "14px", lineHeight: "1.7" }}>
                                    <span className="font-semibold text-red-700 dark:text-red-400">B 派：</span>
                                    {d.sideB}
                                </div>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 italic border-t border-orange-100 dark:border-orange-900/30 pt-1.5" style={{ fontSize: "13px", lineHeight: "1.6" }}>
                                根源：{d.rootCause}
                            </p>
                        </div>
                    ))}
                    {(!divergences || divergences.length === 0) && (
                        <p className="text-sm text-gray-400 italic">未检测到明显分歧。</p>
                    )}
                </div>
            </section>

            {/* Gap */}
            {gap && (gap.hit || gap.miss) && (
                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-l-4 border-blue-500 pl-2" style={{ fontSize: "14px" }}>🔍 视频 vs 评论 (Gap)</h3>
                    <div className="space-y-2">
                        {gap.hit && (
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-3 rounded-lg">
                                <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1 uppercase" style={{ fontSize: "12px" }}>命中区</p>
                                <p className="text-gray-800 dark:text-gray-200" style={{ fontSize: "14px", lineHeight: "1.7" }}>{gap.hit}</p>
                            </div>
                        )}
                        {gap.miss && (
                            <div className="bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 p-3 rounded-lg">
                                <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1 uppercase" style={{ fontSize: "12px" }}>盲区 / 溢出</p>
                                <p className="text-gray-800 dark:text-gray-200" style={{ fontSize: "14px", lineHeight: "1.7" }}>{gap.miss}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Spotlight */}
            {spotlight && spotlight.length > 0 && (
                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-l-4 border-yellow-500 pl-2" style={{ fontSize: "14px" }}>💡 独立见解</h3>
                    <div className="space-y-2">
                        {spotlight.map((s, i) => (
                            <p
                                key={i}
                                className="text-gray-700 dark:text-gray-300 italic border-l-2 border-yellow-400 dark:border-yellow-600 pl-3 py-1"
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
