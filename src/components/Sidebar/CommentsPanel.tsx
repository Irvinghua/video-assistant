import { useVideo } from "../../contexts/VideoContext"
import { useCommentAnalysis } from "../../hooks/useCommentAnalysis"

export function CommentsPanel() {
    const { comments } = useVideo()
    const { analysis, loading, error, handleAnalyze } = useCommentAnalysis()

    if (!analysis && !loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <p className="text-sm text-gray-500 mb-4 text-center">
                    Analyzes top {comments.length} comments for insights.
                </p>
                <button
                    onClick={handleAnalyze}
                    className="px-6 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 transition font-medium"
                >
                    Analyze Comments
                </button>
                {error && <p className="text-red-500 mt-2 text-sm text-center">{error}</p>}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mb-2"></div>
                <p className="text-gray-500 text-sm">Analyzing Sentiment...</p>
            </div>
        )
    }

    const sentiment = analysis!.sentiment

    return (
        <div className="p-4 space-y-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base border-b pb-2">Comment Analysis</h3>

            {/* Sentiment Chart */}
            <section className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Public Sentiment</h4>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-green-600 dark:text-green-400 font-medium">Positive</span>
                            <span className="text-gray-600 dark:text-gray-400">{(sentiment.positive * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${sentiment.positive * 100}%` }}></div>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-red-600 dark:text-red-400 font-medium">Negative</span>
                            <span className="text-gray-600 dark:text-gray-400">{(sentiment.negative * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: `${sentiment.negative * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Clusters */}
            <section>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-sm border-l-4 border-purple-500 pl-2">Top Viewpoints</h3>
                <div className="space-y-3">
                    {analysis!.clusters.map((cluster, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 rounded-lg shadow-sm hover:border-purple-200 dark:hover:border-purple-900 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-purple-700 dark:text-purple-300 text-xs">{cluster.label}</span>
                                <span className="text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
                                    {(cluster.ratio * 100).toFixed()}%
                                </span>
                            </div>
                            <div className="space-y-2">
                                {cluster.examples.slice(0, 2).map((ex, i) => (
                                    <p key={i} className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed pl-2 border-l border-gray-100 dark:border-gray-800 italic">
                                        "{ex}"
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Controversies */}
            <section>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-sm border-l-4 border-orange-500 pl-2">Hot Topics</h3>
                <div className="space-y-3">
                    {analysis!.controversies.map((item, idx) => (
                        <div key={idx} className="bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 p-3 rounded-lg">
                            <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2">{item.topic}</h4>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                                    <span className="text-sm">👍</span> {item.agreed}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                                    <span className="text-sm">👎</span> {item.disagreed}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
