import { OpenAIService } from "./OpenAIService"

// Generic adapter for OpenAI-compatible APIs
export class GenericOpenAIService extends OpenAIService {
    constructor(apiKey: string, modelName: string, baseUrl: string) {
        super(apiKey, modelName, baseUrl)
    }
}

// Specific implementations just configured via Factory
// We don't need separate files for Grok/Qwen/DeepSeek if they follow OpenAI format.
// We can handle them in Factory by instantiating OpenAIService with correct Base URL.
