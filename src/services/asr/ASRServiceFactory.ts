import type { IASRService } from "./types"
import { WebSpeechService } from "./WebSpeechService"
import { WhisperService } from "./WhisperService"
import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export class ASRServiceFactory {
    static async getService(): Promise<IASRService> {
        const type = await storage.get("asrType") || "web_speech"

        if (type === "remote_api") {
            const keys = await storage.get("apiKeys") || {}
            return new WhisperService(keys["Whisper"] || "")
        }

        return new WebSpeechService()
    }
}
