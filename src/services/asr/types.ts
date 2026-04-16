import type { SubtitleSegment } from "../platform/types"

export interface TranscriptResult {
    text: string
    /**
     * Time-aligned segments. Empty when the provider does not return segments
     * (e.g., Web Speech fallback, or providers without verbose_json support).
     */
    segments: SubtitleSegment[]
}

export interface IASRService {
    /**
     * Transcribe a single audio Blob into a structured result.
     * The Blob is expected to fit the provider's size limit; long audio must be
     * chunked upstream (see ASRPipeline).
     */
    transcribe(audio: Blob): Promise<TranscriptResult>

    /**
     * Whether the service is currently usable (API key present, browser support, etc.)
     */
    isAvailable(): Promise<boolean>
}
