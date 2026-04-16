import type { IASRService } from "./types"
import { WhisperService } from "./WhisperService"

export class ASRServiceFactory {
    static async getService(): Promise<IASRService> {
        return new WhisperService()
    }
}
