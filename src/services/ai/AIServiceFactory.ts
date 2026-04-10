import type { IAIService } from "./types"
import { GeminiService } from "./GeminiService"
import { OpenAIService } from "./OpenAIService"
import { ClaudeService } from "./ClaudeService"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export class AIServiceFactory {
    static async getService(): Promise<IAIService> {
        const modelName = await storage.get("selectedModel") || "Gemini"
        const apiKeys = await storage.get("apiKeys") || {}
        const apiKey = apiKeys[modelName]

        if (!apiKey) {
            throw new Error(`API Key for ${modelName} is missing`)
        }

        switch (modelName) {
            case "Gemini":
                return new GeminiService(apiKey)
            case "ChatGPT":
                return new OpenAIService(apiKey)
            case "Claude":
                return new ClaudeService(apiKey)
            case "Grok":
                return new OpenAIService(apiKey, "grok-1", "https://api.x.ai/v1")
            case "Qwen":
                return new OpenAIService(apiKey, "qwen-turbo", "https://dashscope.aliyuncs.com/compatible-mode/v1")
            case "GLM":
                return new OpenAIService(apiKey, "glm-4", "https://open.bigmodel.cn/api/paas/v4")
            case "Kimi":
                return new OpenAIService(apiKey, "moonshot-v1-8k", "https://api.moonshot.cn/v1")
            case "DeepSeek":
                return new OpenAIService(apiKey, "deepseek-chat", "https://api.deepseek.com")
            default:
                // Default to OpenAI compatible if unknown
                return new OpenAIService(apiKey, modelName)
        }
    }
}
