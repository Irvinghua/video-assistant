import type { IAIService } from "./types"
import { GeminiService } from "./GeminiService"
import { OpenAIService } from "./OpenAIService"
import { ClaudeService } from "./ClaudeService"
import { OllamaService } from "./OllamaService"
import { Storage } from "@plasmohq/storage"
import { LOCALE_STORAGE_KEY } from "../../i18n"

const storage = new Storage()

const Z_AI_URL_INTL = "https://api.z.ai/api/paas/v4"
const Z_AI_URL_CN = "https://open.bigmodel.cn/api/paas/v4"

const DEFAULTS = {
    OpenAI: { model: "gpt-4o-mini", url: "https://api.openai.com/v1" },
    Anthropic: { model: "claude-opus-4-7", url: "https://api.anthropic.com/v1" },
    Gemini: { model: "gemini-3.1-pro", url: "https://generativelanguage.googleapis.com/v1beta" },
    Grok: { model: "grok-4-fast", url: "https://api.x.ai/v1" },
    Qwen: { model: "qwen3.6-plus", url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    "Z.AI": { model: "glm-5.1", url: Z_AI_URL_INTL },
    MiniMax: { model: "MiniMax-2.5", url: "https://api.minimax.io/v1" },
    DeepSeek: { model: "deepseek-v3", url: "https://api.deepseek.com" },
    "Ollama Cloud": { model: "glm-5.1", url: "https://ollama.com/api/chat" }
} as const

type Provider = keyof typeof DEFAULTS

async function resolveDefaultUrl(provider: Provider): Promise<string> {
    if (provider === "Z.AI") {
        const lang = await storage.get(LOCALE_STORAGE_KEY)
        return lang === "zh-CN" ? Z_AI_URL_CN : Z_AI_URL_INTL
    }
    return DEFAULTS[provider].url
}

export class AIServiceFactory {
    static async getService(): Promise<IAIService> {
        const provider = ((await storage.get("chatProvider")) || "OpenAI") as Provider
        const fallback = DEFAULTS[provider] ?? DEFAULTS.OpenAI
        const model = (await storage.get("chatModel")) || fallback.model
        const apiUrl = (await storage.get("chatApiUrl")) || (await resolveDefaultUrl(provider))
        const apiKey = await storage.get("chatApiKey")

        if (!apiKey) {
            throw new Error(`API Key for ${provider} is missing`)
        }

        switch (provider) {
            case "Anthropic":
                return new ClaudeService(apiKey, model, apiUrl)
            case "Gemini":
                return new GeminiService(apiKey, model, apiUrl)
            case "Ollama Cloud":
                return new OllamaService(apiKey, model, apiUrl)
            case "OpenAI":
            case "Grok":
            case "Qwen":
            case "Z.AI":
            case "MiniMax":
            case "DeepSeek":
            default:
                return new OpenAIService(apiKey, model, apiUrl)
        }
    }
}
