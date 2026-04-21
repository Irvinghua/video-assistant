import { useEffect, useRef, useState } from "react"
import { Globe } from "lucide-react"

import { LANGUAGE_DISPLAY_NAMES, SUPPORTED_LOCALES, type Locale } from "../i18n"
import { useI18n } from "../i18n/I18nProvider"
import { useTranslation } from "../i18n/useTranslation"

interface Props {
    /** "compact" 用于侧边栏顶部；"full" 用于 options 页。 */
    variant?: "compact" | "full"
}

/** 下拉选择器；compact 版只显示地球图标 + 当前缩写，点击展开菜单。 */
export function LanguageSwitcher({ variant = "compact" }: Props) {
    const { locale, setLocale } = useI18n()
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [open])

    if (variant === "full") {
        return (
            <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            >
                {SUPPORTED_LOCALES.map((loc) => (
                    <option key={loc} value={loc}>
                        {LANGUAGE_DISPLAY_NAMES[loc]}
                    </option>
                ))}
            </select>
        )
    }

    return (
        <div ref={wrapperRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                title={t("sidebar.languageSwitcher.tooltip")}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 transition-colors flex items-center gap-1"
            >
                <Globe size={16} />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    {locale === "zh-CN" ? "ZH" : locale.toUpperCase()}
                </span>
            </button>
            {open && (
                <div className="absolute end-0 top-full mt-1 z-50 min-w-[140px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                    {SUPPORTED_LOCALES.map((loc) => (
                        <button
                            key={loc}
                            onClick={() => {
                                setLocale(loc)
                                setOpen(false)
                            }}
                            className={`w-full text-start px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                loc === locale
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-semibold"
                                    : "text-gray-700 dark:text-gray-200"
                            }`}
                        >
                            {LANGUAGE_DISPLAY_NAMES[loc]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
