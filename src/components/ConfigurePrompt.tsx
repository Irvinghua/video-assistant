import { Settings, AlertTriangle } from "lucide-react"
import { useTranslation } from "../i18n/useTranslation"

interface Props {
    kind: "chat" | "asr"
}

export function ConfigurePrompt({ kind }: Props) {
    const { t } = useTranslation()

    const handleOpen = () => {
        try {
            chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" }, () => {
                if (chrome.runtime.lastError) {
                    window.open(chrome.runtime.getURL("options.html"))
                }
            })
        } catch {
            window.open(chrome.runtime.getURL("options.html"))
        }
    }

    const titleKey = `configure.${kind}.title`
    const buttonKey = `configure.${kind}.button`
    const descKey = `configure.${kind}.desc`

    return (
        <div className="p-6 flex flex-col items-center justify-center h-full gap-5 text-center">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center border border-amber-100 dark:border-amber-900/30">
                <AlertTriangle size={28} className="text-amber-500" />
            </div>
            <p className="text-gray-800 dark:text-gray-200 font-bold text-base">{t(titleKey)}</p>
            <button
                onClick={handleOpen}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 flex items-center gap-2 hover:bg-blue-700 transition"
            >
                <Settings size={18} />
                {t(buttonKey)}
            </button>
            <p className="text-gray-500 dark:text-gray-400 text-xs leading-relaxed max-w-[280px]">
                {t(descKey)}
            </p>
        </div>
    )
}
