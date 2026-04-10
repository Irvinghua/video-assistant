export interface IASRService {
    /**
     * Transcribe audio stream or file
     * Note: For browser environment, we might stream audio or provide a blob
     */
    transcribe(audio: Blob): Promise<string>

    /**
     * Check if service is available/configured
     */
    isAvailable(): Promise<boolean>
}
