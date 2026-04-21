import { useRef, useEffect } from "react"
import { Transformer } from "markmap-lib"
import { Markmap } from "markmap-view"
import { Toolbar } from "markmap-toolbar"
import "markmap-toolbar/dist/style.css"
import { Loader2, Mic, FileAudio } from "lucide-react"

import { useVideo } from "../../contexts/VideoContext"
import { useMindMap } from "../../hooks/useMindMap"
import { useApiKeyStatus } from "../../hooks/useApiKeyStatus"
import { useTranslation } from "../../i18n/useTranslation"
import { ConfigurePrompt } from "../ConfigurePrompt"

interface Props {
    isActive: boolean
}

const transformer = new Transformer()

export function MindMapPanel({ isActive }: Props) {
    const { subtitles, dataLoading } = useVideo()
    const { hasChatKey, hasAsrKey } = useApiKeyStatus()
    const { markdown, loading, error, asrStep, handleDigitalASR } = useMindMap(isActive && hasChatKey)
    const { t } = useTranslation()

    const svgRef = useRef<SVGSVGElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)
    const mmRef = useRef<Markmap | null>(null)

    useEffect(() => {
        if (!isActive || !markdown || !svgRef.current) return
        renderMap(markdown)
    }, [isActive, markdown, loading])

    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)")
        const handler = () => applyTextColors()
        mq.addEventListener("change", handler)
        return () => mq.removeEventListener("change", handler)
    }, [markdown])

    const applyTextColors = () => {
        if (!svgRef.current) return
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
        const color = dark ? "#e5e7eb" : "#1f2937"
        svgRef.current.querySelectorAll("foreignObject div").forEach((el) => {
            ;(el as HTMLElement).style.setProperty("color", color, "important")
        })
    }

    const renderMap = (md: string) => {
        if (!svgRef.current) return

        const rect = svgRef.current.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
            requestAnimationFrame(() => renderMap(md))
            return
        }

        try {
            if (!mmRef.current) {
                mmRef.current = Markmap.create(svgRef.current)

                if (wrapperRef.current && !toolbarRef.current) {
                    const toolbar = new Toolbar()
                    toolbar.attach(mmRef.current)
                    toolbar.setBrand(false)
                    const el = toolbar.render()
                    el.style.position = "absolute"
                    el.style.bottom = "10px"
                    el.style.right = "10px"
                    wrapperRef.current.append(el)
                    // @ts-ignore
                    toolbarRef.current = el
                }
            }

            const { root } = transformer.transform(md)
            mmRef.current.setData(root)

            setTimeout(() => {
                if (mmRef.current && isActive) {
                    mmRef.current.fit()
                    applyTextColors()
                }
            }, 300)
        } catch (e) {
            console.error("[MindMapPanel] Render error:", e)
        }
    }

    if (!hasChatKey) return <ConfigurePrompt kind="chat" />

    if (loading || asrStep === "generating") {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                <p className="text-gray-500 text-sm">{t("mindmap.generating")}</p>
            </div>
        )
    }

    if (asrStep !== "idle") {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="animate-spin text-orange-500 w-10 h-10" />
                <div className="text-center">
                    <p className="text-gray-700 font-bold text-sm uppercase tracking-wide">{t(`asr.step.${asrStep}`)}...</p>
                    <p className="text-gray-400 text-[10px] mt-1">{t("summary.asrNote")}</p>
                </div>
            </div>
        )
    }

    if (markdown) {
        return (
            <div className="absolute inset-0 bg-white dark:bg-gray-900 overflow-hidden" ref={wrapperRef}>
                <svg ref={svgRef} className="w-full h-full" />
            </div>
        )
    }

    if (dataLoading && subtitles.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="animate-spin text-blue-500" size={28} />
                <div className="text-center">
                    <p className="text-gray-700 dark:text-gray-200 font-bold text-sm">{t("summary.detecting")}</p>
                    <p className="text-gray-400 text-xs mt-1">{t("summary.detectingDesc")}</p>
                </div>
            </div>
        )
    }

    if (subtitles.length === 0 && !dataLoading) {
        if (!hasAsrKey) return <ConfigurePrompt kind="asr" />
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full gap-5 text-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <FileAudio size={28} className="text-gray-300" />
                </div>
                <div>
                    <p className="text-gray-800 dark:text-gray-200 font-bold">{t("summary.noSubtitles")}</p>
                    <p className="text-gray-400 text-xs px-8">{t("summary.noSubtitlesDesc")}</p>
                </div>
                <button
                    onClick={handleDigitalASR}
                    className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-100 flex items-center gap-2"
                >
                    <Mic size={18} />
                    {t("summary.summarizeViaAsr")}
                </button>
                {error && <p className="text-red-500 text-[10px] mt-2 bg-red-50 p-2 rounded">{error}</p>}
            </div>
        )
    }

    return (
        <div className="p-4 flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="animate-spin text-blue-500" size={28} />
            <div className="text-center">
                <p className="text-gray-700 dark:text-gray-200 font-bold text-sm">{t("mindmap.preparing")}</p>
                <p className="text-gray-400 text-xs mt-1">{t("mindmap.linesAvailable", { count: subtitles.length })}</p>
            </div>
            {error && <p className="text-red-500 text-[10px] mt-2 bg-red-50 p-2 rounded">{error}</p>}
        </div>
    )
}
