import { useI18n } from "./I18nProvider"
import type { Locale } from "./index"

/**
 * 简化 hook：只需 t 函数时用这个；需要 locale/setLocale/dir 时用 useI18n。
 */
export function useTranslation(): {
    t: (key: string, params?: Record<string, string | number>) => string
    locale: Locale
    dir: "ltr" | "rtl"
} {
    const { t, locale, dir } = useI18n()
    return { t, locale, dir }
}
