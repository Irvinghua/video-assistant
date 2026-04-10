import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"
import { Trash2, Save, CheckCircle, ExternalLink } from "lucide-react"
import { cacheService } from "./services/cache/CacheService"

import "./style.css"

const storage = new Storage()

const MODEL_OPTIONS = [
    { value: "Gemini", label: "Gemini", placeholder: "Enter Gemini API Key" },
    { value: "ChatGPT", label: "ChatGPT (OpenAI)", placeholder: "Enter OpenAI API Key" },
    { value: "Claude", label: "Claude (Anthropic)", placeholder: "Enter Anthropic API Key" },
    { value: "Grok", label: "Grok (xAI)", placeholder: "Enter xAI API Key" },
    { value: "Qwen", label: "Qwen (通义千问)", placeholder: "Enter Qwen API Key" },
    { value: "GLM", label: "GLM (智谱)", placeholder: "Enter GLM API Key" },
    { value: "Kimi", label: "Kimi (月之暗面)", placeholder: "Enter Kimi API Key" },
    { value: "DeepSeek", label: "DeepSeek", placeholder: "Enter DeepSeek API Key" }
]

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
    const [selectedModel, setSelectedModel] = useState("Gemini")
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
    
    // ASR States
    const [asrProvider, setAsrProvider] = useState("OpenAI")
    const [asrModel, setAsrModel] = useState("whisper-1")
    const [asrApiUrl, setAsrApiUrl] = useState("https://api.openai.com/v1")
    const [asrApiKey, setAsrApiKey] = useState("")

    const [cacheDays, setCacheDays] = useState(3)
    const [notionToken, setNotionToken] = useState("")
    const [readwiseToken, setReadwiseToken] = useState("")
    const [obsidianVault, setObsidianVault] = useState("")
    const [status, setStatus] = useState("")
    const [cacheCleared, setCacheCleared] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        const model = await storage.get("selectedModel") || "Gemini"
        const keys = await storage.get("apiKeys") || {}
        
        const provider = await storage.get("asrProvider") || "OpenAI"
        const amodel = await storage.get("asrModel") || "whisper-1"
        const asrUrl = await storage.get("asrApiUrl") || "https://api.openai.com/v1"
        const asrKey = await storage.get("asrApiKey") || ""
        
        const days = await storage.get("cacheDays") || 3
        const notion = await storage.get("notionToken") || ""
        const readwise = await storage.get("readwiseToken") || ""
        const obsidian = await storage.get("obsidianVault") || ""

        setSelectedModel(model)
        setApiKeys(keys)
        setAsrProvider(provider)
        setAsrModel(amodel)
        setAsrApiUrl(asrUrl)
        setAsrApiKey(asrKey)
        setCacheDays(Number(days))
        setNotionToken(notion)
        setReadwiseToken(readwise)
        setObsidianVault(obsidian)
    }

    const handleSave = async () => {
        await storage.set("selectedModel", selectedModel)
        await storage.set("apiKeys", apiKeys)
        await storage.set("asrProvider", asrProvider)
        await storage.set("asrModel", asrModel)
        await storage.set("asrApiUrl", asrApiUrl)
        await storage.set("asrApiKey", asrApiKey)
        await storage.set("cacheDays", cacheDays)
        await storage.set("notionToken", notionToken)
        await storage.set("readwiseToken", readwiseToken)
        await storage.set("obsidianVault", obsidianVault)
        setStatus("Settings saved!")
        setTimeout(() => setStatus(""), 2000)
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

    const handleKeyChange = (provider: string, value: string) => {
        setApiKeys(prev => ({ ...prev, [provider]: value }))
    }

    const handleClearCache = async () => {
        try {
            await cacheService.clearAll()
            // Force clear storage object just in case
            await chrome.storage.local.clear()
            setCacheCleared(true)
            setTimeout(() => setCacheCleared(false), 2000)
        } catch (e) {
            console.error("Failed to clear cache", e)
        }
    }

    const currentModel = MODEL_OPTIONS.find(m => m.value === selectedModel) || MODEL_OPTIONS[0]

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 text-gray-900 dark:text-gray-100 font-sans">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-blue-600 p-2 rounded-lg">
                        <Save className="text-white" size={24} />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Configuration</h1>
                </div>

                {/* ====== Section 1: AI Model Settings ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 p-1.5 rounded-md">🤖</span>
                        Summary & Chat Model
                    </h2>

                    <div className="grid gap-5">
                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Default Model Provider</label>
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                            >
                                {MODEL_OPTIONS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                {currentModel.label} API Key
                            </label>
                            <input
                                type="password"
                                value={apiKeys[selectedModel] || ""}
                                onChange={(e) => handleKeyChange(selectedModel, e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={currentModel.placeholder}
                            />
                        </div>
                    </div>
                </section>

                {/* ====== Section 2: Remote ASR Settings ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 p-1.5 rounded-md">🎙️</span>
                        Remote ASR
                    </h2>
                    
                    <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                        Used for videos without official subtitles. Digital audio is extracted and sent to this API for transcription.
                    </p>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Default Model Provider</label>
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
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Specify Model</label>
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
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">API Endpoint URL</label>
                            <input
                                type="text"
                                value={asrApiUrl}
                                onChange={(e) => setAsrApiUrl(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder="e.g. https://api.openai.com/v1"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">ASR API Key</label>
                            <input
                                type="password"
                                value={asrApiKey}
                                onChange={(e) => setAsrApiKey(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                placeholder={`Enter API Key for ${asrProvider}`}
                            />
                        </div>
                    </div>
                </section>

                {/* ====== Section 3: Cache Settings ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-600 p-1.5 rounded-md">💾</span>
                        Storage & Cache
                    </h2>

                    <div className="flex items-end gap-4 mb-6">
                        <div className="flex-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Cache Validity (Days)</label>
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
                            {cacheCleared ? "Cleared!" : "Clear All Cache"}
                        </button>
                    </div>
                </section>

                {/* ====== Section 4: Knowledge Export ====== */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 p-1.5 rounded-md">📤</span>
                        Knowledge Export
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Notion Token</label>
                            <input
                                type="password"
                                value={notionToken}
                                onChange={(e) => setNotionToken(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="secret_..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Readwise Token</label>
                            <input
                                type="password"
                                value={readwiseToken}
                                onChange={(e) => setReadwiseToken(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Obsidian Vault Path</label>
                            <input
                                type="text"
                                value={obsidianVault}
                                onChange={(e) => setObsidianVault(e.target.value)}
                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="/path/to/vault"
                            />
                        </div>
                    </div>
                </section>

                <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-gray-400 italic">
                        All keys are stored locally in your browser.
                    </div>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-200 dark:shadow-none"
                    >
                        <Save size={18} />
                        Save All Settings
                    </button>
                </div>

                {status && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-gray-900 text-white rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex items-center gap-2 font-medium">
                        <CheckCircle size={18} className="text-green-400" />
                        {status}
                    </div>
                )}
            </div>
        </div>
    )
}

export default OptionsIndex
