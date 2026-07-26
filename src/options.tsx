import { useEffect, useState, useRef } from "react"
import { Storage } from "@plasmohq/storage"
import { Trash2, Save, CheckCircle, HelpCircle } from "lucide-react"
import { cacheService } from "./services/cache/CacheService"
import { SECTION_ORDER, DEFAULT_SECTIONS, parseSections, type Section } from "./services/export/exportStructure"
import { I18nProvider } from "./i18n/I18nProvider"
import { useTranslation } from "./i18n/useTranslation"
import { LanguageSwitcher } from "./components/LanguageSwitcher"

import "./style.css"

const storage = new Storage()

const Z_AI_URL_INTL = "https://api.z.ai/api/paas/v4"
const Z_AI_URL_CN = "https://open.bigmodel.cn/api/paas/v4"

const CHAT_CONFIGS = {
    "OpenAI": {
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4-turbo", "o1", "o1-mini", "o3-mini"],
        defaultUrl: "https://api.openai.com/v1"
    },
    "Anthropic": {
        models: [
            "claude-opus-4-7",
            "claude-sonnet-4-6",
            "claude-haiku-4-5",
            "claude-opus-4-1",
            "claude-3-7-sonnet-latest",
            "claude-3-5-sonnet-latest",
            "claude-3-5-haiku-latest"
        ],
        defaultUrl: "https://api.anthropic.com/v1"
    },
    "Gemini": {
        models: ["gemini-3.1-pro", "gemini-3.1-flash-lite", "gemini-3-flash"],
        defaultUrl: "https://generativelanguage.googleapis.com/v1beta"
    },
    "Grok": {
        models: ["grok-4.20-reasoning", "grok-4-fast"],
        defaultUrl: "https://api.x.ai/v1"
    },
    "Qwen": {
        models: ["qwen3.6-plus", "qwen3.5-plus", "qwen2.5"],
        defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    },
    "Z.AI": {
        models: ["glm-5.1", "glm-5", "glm-4.7"],
        defaultUrl: Z_AI_URL_INTL
    },
    "MiniMax": {
        models: ["MiniMax-M3", "MiniMax-2.5", "MiniMax-M2.7"],
        defaultUrl: "https://api.minimax.io/v1"
    },
    "Custom": {
        models: [],
        defaultUrl: ""
    },
    "DeepSeek": {
        models: ["deepseek-v3", "deepseek-r2"],
        defaultUrl: "https://api.deepseek.com"
    },
    "Ollama Cloud": {
        models: [
            "gemini-3-flash-preview",
            "gemma4",
            "glm-4.7",
            "glm-5",
            "glm-5.1",
            "qwen3.5"
        ],
        defaultUrl: "https://ollama.com/api/chat"
    }
}

const OLLAMA_PREFIXES = ["glm", "qwen", "gemma", "gemini"] as const

async function fetchOllamaModels(): Promise<string[]> {
    const resp = await chrome.runtime.sendMessage({
        type: "FETCH_API",
        url: "https://ollama.com/api/tags",
        options: { method: "GET" }
    })
    if (!resp?.success) throw new Error(resp?.error || "network error")
    const models: any[] = resp.data?.models || []
    return models
        .map((m: any) => (typeof m?.name === "string" ? m.name : null))
        .filter((n): n is string => n !== null)
        .filter((n) => OLLAMA_PREFIXES.some((p) => n.toLowerCase().startsWith(p)))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

function resolveChatDefaultUrl(provider: string, locale: string): string {
    if (provider === "Z.AI") {
        return locale === "zh-CN" ? Z_AI_URL_CN : Z_AI_URL_INTL
    }
    return CHAT_CONFIGS[provider as keyof typeof CHAT_CONFIGS]?.defaultUrl ?? ""
}

const ASR_CONFIGS = {
    "OpenAI": {
        models: ["whisper-1"],
        defaultUrl: "https://api.openai.com/v1"
    },
    "Groq": {
        models: ["whisper-large-v3", "distil-whisper-large-v3-en"],
        defaultUrl: "https://api.groq.com/openai/v1"
    },
    "Gemini": {
        models: ["gemini-1.5-flash", "gemini-1.5-pro"],
        defaultUrl: "https://generativelanguage.googleapis.com/v1beta"
    },
    "Qwen": {
        models: ["paraformer-v1", "sensevoice-v1"],
        defaultUrl: "https://dashscope.aliyuncs.com/api/v1"
    },
    "Anthropic": {
        models: ["claude-3-5-sonnet-20240620"],
        defaultUrl: "https://api.anthropic.com/v1"
    }
}

function OptionsIndex() {
    const { t, locale } = useTranslation()
    const [chatProvider, setChatProvider] = useState("OpenAI")
    const [chatModel, setChatModel] = useState(CHAT_CONFIGS.OpenAI.models[0])
    const [chatApiUrl, setChatApiUrl] = useState(CHAT_CONFIGS.OpenAI.defaultUrl)
    const [chatApiKey, setChatApiKey] = useState("")
    const [ollamaModels, setOllamaModels] = useState<string[]>(CHAT_CONFIGS["Ollama Cloud"].models)
    const [ollamaLoading, setOllamaLoading] = useState(false)
    const [ollamaError, setOllamaError] = useState("")

    const [asrProvider, setAsrProvider] = useState("OpenAI")
    const [asrModel, setAsrModel] = useState("whisper-1")
    const [asrApiUrl, setAsrApiUrl] = useState("https://api.openai.com/v1")
    const [asrApiKey, setAsrApiKey] = useState("")

    const [cacheDays, setCacheDays] = useState(3)
    const [notionToken, setNotionToken] = useState("")
    const [notionParentPageId, setNotionParentPageId] = useState("")
    const [obsidianVault, setObsidianVault] = useState("")
    const [obsidianFolder, setObsidianFolder] = useState("")
    const [exportTarget, setExportTarget] = useState<"notion" | "obsidian">("notion")
    const [exportSections, setExportSections] = useState<Section[]>(DEFAULT_SECTIONS)
    const [configPrompt, setConfigPrompt] = useState<"notion" | "obsidian" | null>(null)
    const [showNotionHelp, setShowNotionHelp] = useState(false)
    const [showObsidianHelp, setShowObsidianHelp] = useState(false)
    const exportSectionRef = useRef<HTMLElement>(null)
    const [status, setStatus] = useState("")
    const [cacheCleared, setCacheCleared] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    // When opened from the sidebar with an unconfigured target, scroll the
    // Knowledge Export section into view so the prompt points at the right place.
    useEffect(() => {
        if (configPrompt) {
            exportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }, [configPrompt])

    useEffect(() => {
        if (chatProvider !== "Ollama Cloud") {
            setOllamaError("")
            setOllamaLoading(false)
            return
        }
        let cancelled = false
        setOllamaLoading(true)
        setOllamaError("")
        fetchOllamaModels()
            .then((list) => {
                if (cancelled) return
                if (list.length > 0) {
                    setOllamaModels(list)
                    setChatModel((prev) => (list.includes(prev) ? prev : list[0]))
                }
            })
            .catch((e) => {
                if (!cancelled) setOllamaError(e?.message || "fetch failed")
            })
            .finally(() => {
                if (!cancelled) setOllamaLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [chatProvider])

    const loadSettings = async () => {
        const cProvider = await storage.get("chatProvider") || "OpenAI"
        const cModel = await storage.get("chatModel") || CHAT_CONFIGS[cProvider as keyof typeof CHAT_CONFIGS]?.models[0] || ""
        const cUrl = await storage.get("chatApiUrl") || resolveChatDefaultUrl(cProvider, locale)
        const cKey = await storage.get("chatApiKey") || ""

        const provider = await storage.get("asrProvider") || "OpenAI"
        const amodel = await storage.get("asrModel") || "whisper-1"
        const asrUrl = await storage.get("asrApiUrl") || "https://api.openai.com/v1"
        const asrKey = await storage.get("asrApiKey") || ""

        const days = await storage.get("cacheDays") || 3
        const notion = await storage.get("notionToken") || ""
        const notionParent = await storage.get("notionParentPageId") || ""
        const obsidian = await storage.get("obsidianVault") || ""
        const obsidianFld = await storage.get("obsidianFolder") || ""
        const eTarget = (await storage.get("exportTarget")) || "notion"
        const eSections = parseSections(await storage.get("exportSections"), await storage.get("exportStructure"))

        setChatProvider(cProvider)
        setChatModel(cModel)
        setChatApiUrl(cUrl)
        setChatApiKey(cKey)
        setAsrProvider(provider)
        setAsrModel(amodel)
        setAsrApiUrl(asrUrl)
        setAsrApiKey(asrKey)
        setCacheDays(Number(days))
        setNotionToken(notion)
        setNotionParentPageId(notionParent)
        setObsidianVault(obsidian)
        setObsidianFolder(obsidianFld)
        const prompt = (await storage.get("exportConfigPrompt")) || ""
        setExportTarget((prompt || eTarget) as "notion" | "obsidian")
        setExportSections(eSections)
        if (prompt === "notion" || prompt === "obsidian") {
            setConfigPrompt(prompt)
            await storage.remove("exportConfigPrompt")
        }
    }

    const handleSave = async () => {
        await storage.set("chatProvider", chatProvider)
        await storage.set("chatModel", chatModel)
        await storage.set("chatApiUrl", chatApiUrl)
        await storage.set("chatApiKey", chatApiKey)
        await storage.set("asrProvider", asrProvider)
        await storage.set("asrModel", asrModel)
        await storage.set("asrApiUrl", asrApiUrl)
        await storage.set("asrApiKey", asrApiKey)
        await storage.set("cacheDays", cacheDays)
        await storage.set("notionToken", notionToken)
        await storage.set("notionParentPageId", notionParentPageId)
        await storage.set("obsidianVault", obsidianVault)
        await storage.set("obsidianFolder", obsidianFolder)
        await storage.set("exportTarget", exportTarget)
        await storage.set("exportSections", exportSections)
        setStatus(t("options.savedToast"))
        setTimeout(() => setStatus(""), 2000)
    }

    const handleChatProviderChange = (provider: string) => {
        setChatProvider(provider)
        const config = CHAT_CONFIGS[provider as keyof typeof CHAT_CONFIGS]
        if (config) {
            setChatModel(config.models[0] || "")
            setChatApiUrl(resolveChatDefaultUrl(provider, locale))
        }
    }

    const handleAsrProviderChange = (provider: string) => {
        setAsrProvider(provider)
        const config = ASR_CONFIGS[provider as keyof typeof ASR_CONFIGS]
        if (config) {
            const firstModel = config.models[0]
            setAsrModel(firstModel)
            setAsrApiUrl(config.defaultUrl)
        }
    }

    const handleAsrModelChange = (model: string) => {
        setAsrModel(model)
    }

    const handleClearCache = async () => {
        try {
            await cacheService.clearAll()
            setCacheCleared(true)
            setTimeout(() => setCacheCleared(false), 2000)
        } catch (e) {
            console.error("Failed to clear cache", e)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 text-gray-900 dark:text-gray-100 font-sans">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-blue-600 p-2 rounded-lg">
                        <Save className="text-white" size={24} />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight">{t("options.title")}</h1>
                </div>

                {/* ====== Section 0: Language ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 p-1.5 rounded-md">🌐</span>
                        {t("options.sections.language")}
                    </h2>
                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                        {t("options.labels.uiLanguage")}
                    </label>
                    <LanguageSwitcher variant="full" />
                    <p className="text-xs text-gray-500 mt-2">{t("options.languageHint")}</p>
                </section>

                {/* ====== Section 1: Summary & Chat Model ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 p-1.5 rounded-md">🤖</span>
                        {t("options.sections.aiModel")}
                    </h2>

                    <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                        {t("options.sections.aiModelDesc")}
                    </p>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.provider")}</label>
                                <select
                                    value={chatProvider}
                                    onChange={(e) => handleChatProviderChange(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                >
                                    {Object.keys(CHAT_CONFIGS).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.chatModel")}</label>
                                {chatProvider === "Custom" ? (
                                    <input
                                        type="text"
                                        value={chatModel}
                                        onChange={(e) => setChatModel(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                        placeholder="e.g. gpt-4o, claude-sonnet-4-20250514, ..."
                                    />
                                ) : (
                                    <select
                                        value={chatModel}
                                        onChange={(e) => setChatModel(e.target.value)}
                                        disabled={chatProvider === "Ollama Cloud" && ollamaLoading}
                                        className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none disabled:opacity-60"
                                    >
                                        {(chatProvider === "Ollama Cloud"
                                            ? ollamaModels
                                            : CHAT_CONFIGS[chatProvider as keyof typeof CHAT_CONFIGS]?.models || []
                                        ).map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                )}
                                {chatProvider === "Ollama Cloud" && ollamaLoading && (
                                    <p className="text-xs text-gray-500 mt-1">{t("options.ollama.loading")}</p>
                                )}
                                {chatProvider === "Ollama Cloud" && ollamaError && (
                                    <p className="text-xs text-red-500 mt-1">{t("options.ollama.fetchFailed", { error: ollamaError })}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.apiEndpoint")}</label>
                            <input
                                type="text"
                                value={chatApiUrl}
                                onChange={(e) => setChatApiUrl(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={t("options.placeholders.chatEndpoint")}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                {t("options.labels.apiKey", { provider: chatProvider })}
                            </label>
                            <input
                                type="password"
                                value={chatApiKey}
                                onChange={(e) => setChatApiKey(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={t("options.placeholders.chatApiKey", { provider: chatProvider })}
                            />
                            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">{t("options.keySafetyHint")}</p>
                        </div>

                        <div className="mt-2 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg text-xs text-gray-700 dark:text-gray-300 leading-relaxed space-y-2">
                            <p>{t("options.freeHint.chatIntro")}</p>
                            <div className="space-y-1">
                                <p>
                                    <span className="font-semibold">{t("options.freeHint.signup")}</span>{" "}
                                    <a href="https://ollama.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">https://ollama.com/</a>
                                </p>
                                <p>
                                    <span className="font-semibold">{t("options.freeHint.keyPage")}</span>{" "}
                                    <a href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">https://ollama.com/settings/keys</a>
                                </p>
                            </div>
                            <p>{t("options.freeHint.usage")}</p>
                            <p className="italic text-gray-500 dark:text-gray-400">{t("options.freeHint.help")}</p>
                        </div>
                    </div>
                </section>

                {/* ====== Section 2: Remote ASR Settings ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 p-1.5 rounded-md">🎙️</span>
                        {t("options.sections.asr")}
                    </h2>

                    <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                        {t("options.sections.asrDesc")}
                    </p>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.provider")}</label>
                                <select
                                    value={asrProvider}
                                    onChange={(e) => handleAsrProviderChange(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                >
                                    {Object.keys(ASR_CONFIGS).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.asrModel")}</label>
                                <select
                                    value={asrModel}
                                    onChange={(e) => handleAsrModelChange(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                >
                                    {(ASR_CONFIGS[asrProvider as keyof typeof ASR_CONFIGS]?.models || []).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.apiEndpoint")}</label>
                            <input
                                type="text"
                                value={asrApiUrl}
                                onChange={(e) => setAsrApiUrl(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={t("options.placeholders.asrEndpoint")}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.asrApiKey")}</label>
                            <input
                                type="password"
                                value={asrApiKey}
                                onChange={(e) => setAsrApiKey(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={t("options.placeholders.asrApiKey", { provider: asrProvider })}
                            />
                            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">{t("options.keySafetyHint")}</p>
                        </div>

                        <div className="mt-2 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg text-xs text-gray-700 dark:text-gray-300 leading-relaxed space-y-2">
                            <p>{t("options.freeHint.asrIntro")}</p>
                            <div className="space-y-1">
                                <p>
                                    <span className="font-semibold">{t("options.freeHint.signup")}</span>{" "}
                                    <a href="https://console.groq.com/home" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">https://console.groq.com/home</a>
                                </p>
                                <p>
                                    <span className="font-semibold">{t("options.freeHint.keyPage")}</span>{" "}
                                    <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">https://console.groq.com/keys</a>
                                </p>
                            </div>
                            <p>{t("options.freeHint.usage")}</p>
                            <p className="italic text-gray-500 dark:text-gray-400">{t("options.freeHint.help")}</p>
                        </div>
                    </div>
                </section>

                {/* ====== Section 3: Cache Settings ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-600 p-1.5 rounded-md">💾</span>
                        {t("options.sections.cache")}
                    </h2>

                    <div className="flex items-end gap-4 mb-6">
                        <div className="flex-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.cacheDays")}</label>
                            <input
                                type="number"
                                min={1}
                                max={30}
                                value={cacheDays}
                                onChange={(e) => setCacheDays(Number(e.target.value))}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <button
                            onClick={handleClearCache}
                            className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-all text-sm font-bold dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-400"
                        >
                            {cacheCleared ? <CheckCircle size={16} /> : <Trash2 size={16} />}
                            {cacheCleared ? t("options.cacheCleared") : t("options.clearAllCache")}
                        </button>
                    </div>
                </section>

                {/* ====== Section 4: Knowledge Export ====== */}
                <section ref={exportSectionRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 p-1.5 rounded-md">📤</span>
                        {t("options.sections.export")}
                    </h2>

                    <div className="space-y-4">
                        {/* 导出目标 */}
                        <div>
                          <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.exportTarget")}</label>
                          <select
                            value={exportTarget}
                            onChange={(e) => setExportTarget(e.target.value as "notion" | "obsidian")}
                            className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="notion">{t("exportTargets.notion")}</option>
                            <option value="obsidian">{t("exportTargets.obsidian")}</option>
                          </select>
                        </div>

                        {exportTarget === "notion" && (
                          <>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setShowNotionHelp(v => !v)}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <HelpCircle size={14} /> {t("options.notionGuide.title")}
                              </button>
                              {showNotionHelp && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNotionHelp(false)}>
                                  <div onClick={(e) => e.stopPropagation()} className="w-[720px] max-w-[90vw] max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 text-xs leading-relaxed text-gray-700 dark:text-gray-300 space-y-3">
                                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{t("options.notionGuide.title")}</p>
                                    <p>{t("options.notionGuide.intro")}</p>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.notionGuide.step1Title")}</p>
                                    <p className="whitespace-pre-line">{t("options.notionGuide.step1Body")}</p>
                                    <a href="https://app.notion.com/developers/connections" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">https://app.notion.com/developers/connections</a>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.notionGuide.step2Title")}</p>
                                    <p className="whitespace-pre-line">{t("options.notionGuide.step2Body")}</p>
                                    <p className="text-gray-500">{t("options.notionGuide.exampleLabel")}</p>
                                    <p className="break-all font-mono text-[11px]">https://app.notion.com/p/Video-Assistant-<span className="font-bold text-blue-600 dark:text-blue-400">376bb287dd2980029ef2fffc970353c0</span></p>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.notionGuide.step3Title")}</p>
                                    <p className="whitespace-pre-line">{t("options.notionGuide.step3Body")}</p>

                                    <p className="text-gray-500">{t("options.notionGuide.done")}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.notionToken")}</label>
                              <input type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t("options.placeholders.notionToken")} />
                              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">{t("options.keySafetyHint")}</p>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.notionParentPageId")}</label>
                              <input type="text" value={notionParentPageId} onChange={(e) => setNotionParentPageId(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t("options.placeholders.notionParentPageId")} />
                            </div>
                          </>
                        )}

                        {exportTarget === "obsidian" && (
                          <>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setShowObsidianHelp(v => !v)}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <HelpCircle size={14} /> {t("options.obsidianGuide.title")}
                              </button>
                              {showObsidianHelp && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowObsidianHelp(false)}>
                                  <div onClick={(e) => e.stopPropagation()} className="w-[720px] max-w-[90vw] max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 text-xs leading-relaxed text-gray-700 dark:text-gray-300 space-y-3">
                                    <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{t("options.obsidianGuide.title")}</p>
                                    <p>{t("options.obsidianGuide.intro")}</p>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.obsidianGuide.step1Title")}</p>
                                    <p className="whitespace-pre-line">{t("options.obsidianGuide.step1Body")}</p>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.obsidianGuide.step2Title")}</p>
                                    <p className="whitespace-pre-line">{t("options.obsidianGuide.step2Body")}</p>

                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t("options.obsidianGuide.howTitle")}</p>
                                    <p>{t("options.obsidianGuide.howBody")}</p>

                                    <p>{t("options.obsidianGuide.note")}</p>
                                    <p className="text-gray-500">{t("options.obsidianGuide.done")}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianVault")}</label>
                              <input type="text" value={obsidianVault} onChange={(e) => setObsidianVault(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t("options.placeholders.obsidianVault")} />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.obsidianFolder")}</label>
                              <input type="text" value={obsidianFolder} onChange={(e) => setObsidianFolder(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t("options.placeholders.obsidianFolder")} />
                            </div>
                          </>
                        )}

                        {/* 导出结构（多选，至少选一项；导出时按固定顺序拼装） */}
                        <div>
                          <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">{t("options.labels.exportStructure")}</label>
                          <div className="flex flex-wrap gap-2">
                            {SECTION_ORDER.map((opt) => {
                              const checked = exportSections.includes(opt)
                              return (
                                <label
                                  key={opt}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                                    checked
                                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold"
                                      : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    value={opt}
                                    checked={checked}
                                    onChange={() => setExportSections(prev =>
                                      prev.includes(opt)
                                        ? (prev.length === 1 ? prev : prev.filter(x => x !== opt)) // keep at least one
                                        : SECTION_ORDER.filter(x => x === opt || prev.includes(x))   // add, keep canonical order
                                    )}
                                    className="accent-blue-600"
                                  />
                                  {t(`exportSections.${opt}`)}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                    </div>
                </section>

                <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-gray-400 italic">
                        {t("options.storageNote")}
                    </div>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-200 dark:shadow-none"
                    >
                        <Save size={18} />
                        {t("options.saveBtn")}
                    </button>
                </div>

                {status && (
                    <div className="fixed bottom-8 start-1/2 -translate-x-1/2 px-6 py-3 bg-gray-900 text-white rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex items-center gap-2 font-medium">
                        <CheckCircle size={18} className="text-green-400" />
                        {status}
                    </div>
                )}

                {configPrompt && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfigPrompt(null)}>
                        <div className="mx-4 max-w-sm w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6" onClick={(e) => e.stopPropagation()}>
                            <p className="text-base text-gray-800 dark:text-gray-100 leading-relaxed">
                                {t("options.configPrompt", { target: t(`exportTargets.${configPrompt}`) })}
                            </p>
                            <div className="mt-5 flex justify-end">
                                <button
                                    onClick={() => setConfigPrompt(null)}
                                    className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                                >
                                    {t("options.configPromptOk")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function OptionsPage() {
    return (
        <I18nProvider>
            <OptionsIndex />
        </I18nProvider>
    )
}

export default OptionsPage
