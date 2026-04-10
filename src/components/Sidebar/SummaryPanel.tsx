import { Loader2, Mic, FileAudio } from "lucide-react"
import { useVideo } from "../../contexts/VideoContext"
import { useSummary } from "../../hooks/useSummary"

export function SummaryPanel() {
    const { videoInfo, subtitles, dataLoading, seekTo } = useVideo()
    const { summary, loading, checkingCache, error, asrStep, handleSummarize, handleDigitalASR, handleExport, handleClearCache } = useSummary()

    if (loading || asrStep === "summarizing") {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                <p className="text-gray-500 text-sm">AI is analyzing...</p>
            </div>
        )
    }

    if (asrStep !== "idle") {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="animate-spin text-orange-500 w-10 h-10" />
                <div className="text-center">
                    <p className="text-gray-700 font-bold text-sm uppercase tracking-wide">{asrStep.replace('_', ' ')}...</p>
                    <p className="text-gray-400 text-[10px] mt-1">Digital extraction. Please wait.</p>
                </div>
            </div>
        )
    }

    if (checkingCache) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <Loader2 className="animate-spin text-gray-300 mb-2" size={20} />
                <p className="text-gray-400 text-[10px]">Syncing...</p>
            </div>
        )
    }

    if (summary) {
        return (
            <div className="p-4 space-y-6">
                <div className="flex justify-between items-center mb-2 border-b pb-2">
                    <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">Summary</h3>
                        <div className="text-[9px] text-gray-400 mt-1">
                            Video ID: {videoInfo?.id} | Cached
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleClearCache} className="text-xs text-orange-500 hover:text-orange-600" title="Clear this video's cache">
                            Clear Cache
                        </button>
                        <button onClick={handleExport} className="text-xs text-gray-500 hover:text-blue-600">Export</button>
                    </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                    <p className="text-gray-800 dark:text-gray-200 text-sm italic font-medium">"{summary.oneLiner}"</p>
                </div>

                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2 border-b pb-1 text-[10px] uppercase opacity-50">Digest</h3>
                    <article className="prose prose-sm dark:prose-invert text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {summary.fullDigest}
                    </article>
                </section>

                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3 border-b pb-1 text-[10px] uppercase opacity-50">Key Points</h3>
                    <div className="space-y-4">
                        {summary.chapters.map((chapter, idx) => (
                            <div key={idx} className="group cursor-pointer" onClick={() => seekTo(chapter.timestamp)}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-mono bg-blue-600 text-white px-1 py-0.5 rounded">{formatTime(chapter.timestamp)}</span>
                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 text-xs">{chapter.title}</h4>
                                </div>
                                <p className="text-[11px] text-gray-600 dark:text-gray-400 ml-1 pl-3 border-l-2 border-gray-100 dark:border-gray-800">{chapter.summary}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        )
    }

    if (subtitles.length === 0 && dataLoading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="animate-spin text-blue-500" size={28} />
                <div className="text-center">
                    <p className="text-gray-700 dark:text-gray-200 font-bold text-sm">检测视频内容中...</p>
                    <p className="text-gray-400 text-xs mt-1">正在获取视频字幕信息</p>
                </div>
            </div>
        )
    }

    if (subtitles.length === 0 && !dataLoading) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-5 text-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <FileAudio size={28} className="text-gray-300" />
                </div>
                <div>
                    <p className="text-gray-800 dark:text-gray-200 font-bold">No Subtitles Found</p>
                    <p className="text-gray-400 text-xs px-8">Extract digital audio and use AI?</p>
                </div>
                <button
                    onClick={handleDigitalASR}
                    className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-100 flex items-center gap-2"
                >
                    <Mic size={18} />
                    Summarize via ASR
                </button>
                {error && <p className="text-red-500 text-[10px] mt-2 bg-red-50 p-2 rounded">{error}</p>}
            </div>
        )
    }

    return (
        <div className="p-4 flex flex-col items-center justify-center h-full gap-5 text-center">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center border border-green-100 dark:border-green-900/30">
                <Loader2 className="text-green-600" size={28} />
            </div>
            <div>
                <p className="text-gray-800 dark:text-gray-200 font-bold">Subtitles Available</p>
                <p className="text-gray-400 text-xs px-10">We found {subtitles.length} lines for {videoInfo?.id}.</p>
            </div>
            <button
                onClick={() => handleSummarize(subtitles)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100"
            >
                Generate Summary Now
            </button>

            <div className="w-full max-w-md">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-2">SUBTITLE PREVIEW</h4>
                    <div className="space-y-1">
                        {subtitles.slice(0, 3).map((sub, idx) => (
                            <div key={idx} className="text-[9px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 rounded px-2 py-1">
                                <span className="text-blue-600 mr-1">{Math.floor(sub.start / 60)}:{(sub.start % 60).toString().padStart(2, '0')}</span>
                                {sub.text}
                            </div>
                        ))}
                        {subtitles.length > 3 && (
                            <p className="text-xs text-gray-500 mt-1">... and {subtitles.length - 3} more lines</p>
                        )}
                    </div>
                </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
    )
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}
