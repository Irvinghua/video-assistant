import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useStorage } from "@plasmohq/storage/hook"

import {
    AI_LANGUAGE_NAMES,
    LOCALE_STORAGE_KEY,
    detectBrowserLocale,
    getDirection,
    isSupportedLocale,
    type Locale
} from "./index"
import en from "./locales/en.json"
import zhCN from "./locales/zh-CN.json"
import hi from "./locales/hi.json"
import es from "./locales/es.json"
import ar from "./locales/ar.json"
import fr from "./locales/fr.json"
import pt from "./locales/pt.json"
import id from "./locales/id.json"
import ja from "./locales/ja.json"
import ko from "./locales/ko.json"

type Dictionary = typeof en

const DICTIONARIES: Record<Locale, Dictionary> = {
    "en": en,
    "zh-CN": zhCN,
    "hi": hi as Dictionary,
    "es": es as Dictionary,
    "ar": ar as Dictionary,
    "fr": fr as Dictionary,
    "pt": pt as Dictionary,
    "id": id as Dictionary,
    "ja": ja as Dictionary,
    "ko": ko as Dictionary
}

export type TranslateParams = Record<string, string | number>
export type TranslateFn = (key: string, params?: TranslateParams) => string

interface I18nContextValue {
    locale: Locale
    setLocale: (next: Locale) => void
    t: TranslateFn
    dir: "ltr" | "rtl"
    aiLanguage: string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function walk(dict: unknown, key: string): unknown {
    return key.split(".").reduce<unknown>((acc, segment) => {
        if (acc && typeof acc === "object" && segment in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[segment]
        }
        return undefined
    }, dict)
}

function interpolate(template: string, params?: TranslateParams): string {
    if (!params) return template
    return template.replace(/\{\{(\w+)\}\}/g, (_, token) => {
        const v = params[token]
        return v === undefined || v === null ? `{{${token}}}` : String(v)
    })
}

function makeTranslator(locale: Locale): TranslateFn {
    const dict = DICTIONARIES[locale] ?? en
    return (key, params) => {
        const raw = walk(dict, key) ?? walk(en, key)
        if (typeof raw !== "string") return key
        return interpolate(raw, params)
    }
}

export function I18nProvider({ children }: { children: ReactNode }) {
    // onInit fires atomically when storage has no value — avoids the race where
    // a freshly mounted Provider in another context (e.g. a newly opened video
    // tab) sees `stored === undefined` mid-hydration and clobbers a value the
    // user just picked elsewhere.
    const [stored, setStored] = useStorage<string>(LOCALE_STORAGE_KEY, (v) =>
        v ?? detectBrowserLocale()
    )

    const locale: Locale = isSupportedLocale(stored) ? stored : detectBrowserLocale()
    const dir = getDirection(locale)

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale: (next) => setStored(next),
        t: makeTranslator(locale),
        dir,
        aiLanguage: AI_LANGUAGE_NAMES[locale]
    }), [locale, dir, setStored])

    return (
        <I18nContext.Provider value={value}>
            <div dir={dir} lang={locale} style={{ display: "contents" }}>
                {children}
            </div>
        </I18nContext.Provider>
    )
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext)
    if (!ctx) {
        throw new Error("useI18n must be used inside <I18nProvider>")
    }
    return ctx
}
