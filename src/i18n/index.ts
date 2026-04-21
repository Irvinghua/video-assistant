/**
 * i18n 支持的 10 种语言 + 语言检测 + 语言展示名。
 *
 * - locale 码采用 BCP-47 简写（zh-CN 是唯一带地区码的，因为我们只支持简体中文）。
 * - detectBrowserLocale() 用 navigator.languages 宽松匹配：
 *      zh-*  → zh-CN       pt-*  → pt        ar-*  → ar
 *      其他未在列表中的 → en
 */

export type Locale =
    | "en"
    | "zh-CN"
    | "hi"
    | "es"
    | "ar"
    | "fr"
    | "pt"
    | "id"
    | "ja"
    | "ko"

export const SUPPORTED_LOCALES: Locale[] = [
    "en",
    "zh-CN",
    "hi",
    "es",
    "ar",
    "fr",
    "pt",
    "id",
    "ja",
    "ko"
]

/** 下拉框里给用户看的本地化名（每个语言都用它自己写）。 */
export const LANGUAGE_DISPLAY_NAMES: Record<Locale, string> = {
    "en": "English",
    "zh-CN": "简体中文",
    "hi": "हिन्दी",
    "es": "Español",
    "ar": "العربية",
    "fr": "Français",
    "pt": "Português",
    "id": "Bahasa Indonesia",
    "ja": "日本語",
    "ko": "한국어"
}

/**
 * 传给 LLM 的英文语言名——用在 prompt 里，让模型按此语言输出。
 * 阿拉伯语用 "Modern Standard Arabic"，避免模型输出方言变体。
 */
export const AI_LANGUAGE_NAMES: Record<Locale, string> = {
    "en": "English",
    "zh-CN": "Simplified Chinese",
    "hi": "Hindi",
    "es": "Spanish",
    "ar": "Modern Standard Arabic",
    "fr": "French",
    "pt": "Portuguese",
    "id": "Indonesian",
    "ja": "Japanese",
    "ko": "Korean"
}

/** 仅 ar 是 RTL。 */
export const RTL_LOCALES: Locale[] = ["ar"]

export function isRTL(locale: Locale): boolean {
    return RTL_LOCALES.includes(locale)
}

export function getDirection(locale: Locale): "rtl" | "ltr" {
    return isRTL(locale) ? "rtl" : "ltr"
}

export function isSupportedLocale(x: unknown): x is Locale {
    return typeof x === "string" && (SUPPORTED_LOCALES as string[]).includes(x)
}

/**
 * 把一个可能带地区码的 BCP-47 tag 映射到我们支持的 Locale。
 * 宽松匹配：zh-TW / zh-HK → zh-CN；pt-BR → pt；ar-EG → ar 等。
 * 不在列表中则返回 null，由调用方决定回退策略。
 */
export function normalizeLocale(tag: string | undefined | null): Locale | null {
    if (!tag) return null
    const lower = tag.toLowerCase()
    const primary = lower.split("-")[0]
    if (primary === "zh") return "zh-CN"
    if (primary === "pt") return "pt"
    if (primary === "ar") return "ar"
    if ((SUPPORTED_LOCALES as string[]).includes(primary)) return primary as Locale
    if ((SUPPORTED_LOCALES as string[]).includes(lower)) return lower as Locale
    return null
}

/**
 * 读取浏览器语言偏好。用 navigator.languages 依次尝试，
 * 第一个能映射到支持列表的就返回；都不行则回退英文。
 */
export function detectBrowserLocale(): Locale {
    const langs = typeof navigator !== "undefined"
        ? (navigator.languages && navigator.languages.length > 0
            ? navigator.languages
            : [navigator.language])
        : []
    for (const raw of langs) {
        const hit = normalizeLocale(raw)
        if (hit) return hit
    }
    return "en"
}

/** storage key——所有上下文（content / popup / options）共用这个。 */
export const LOCALE_STORAGE_KEY = "userLanguage"
