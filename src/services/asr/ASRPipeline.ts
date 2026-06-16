import type { SubtitleSegment } from "../platform/types"
import { ASRServiceFactory } from "./ASRServiceFactory"
import {
    CHUNK_SECONDS,
    TARGET_SAMPLE_RATE,
    decodeToMonoPCM,
    encodeWAV,
    sliceByDuration,
} from "./audioProcessor"
import type { TranscriptResult } from "./types"

const PARALLEL_LIMIT = 3

// Whisper's upload cap is 25 MB. Compressed audio streams (~50-130 kbps) stay
// under this for ~40+ min of video, so the common case never needs decoding.
const WHISPER_SIZE_LIMIT = 24 * 1024 * 1024

export interface PipelineProgress {
    phase: "decoding" | "transcribing"
    /** 1-indexed current chunk when phase === "transcribing" */
    current?: number
    total?: number
}

/**
 * Transcribe arbitrarily long audio.
 *
 * Fast path (compressed audio ≤ 24 MB): upload the original blob straight to
 * Whisper. This is the overwhelmingly common case and avoids both the decode
 * and — crucially — re-encoding to a multi-MB uncompressed WAV, which bloats
 * the upload ~5× (e.g. 1.3 MB m4a → 6.1 MB WAV) and dominates latency on slow
 * uplinks. Whisper resamples to 16 kHz mono internally, so the WAV gained us
 * nothing but size.
 *
 * Slow path (oversized audio): decode to 16 kHz mono PCM, slice into ~10 min
 * chunks, WAV-encode and transcribe each with bounded parallelism, then merge
 * segments with absolute-time offsets. Decoding is the only way to split audio
 * that exceeds the single-request cap.
 */
export async function transcribeLongAudio(
    audioBlob: Blob,
    onProgress?: (p: PipelineProgress) => void
): Promise<TranscriptResult> {
    const service = await ASRServiceFactory.getService()

    if (audioBlob.size <= WHISPER_SIZE_LIMIT) {
        onProgress?.({ phase: "transcribing", current: 0, total: 1 })
        const res = await service.transcribe(audioBlob)
        onProgress?.({ phase: "transcribing", current: 1, total: 1 })
        return { text: res.text, segments: res.segments }
    }

    onProgress?.({ phase: "decoding" })
    const decoded = await decodeToMonoPCM(audioBlob)
    const chunks = sliceByDuration(decoded, CHUNK_SECONDS)

    const results: TranscriptResult[] = new Array(chunks.length)
    let completed = 0
    onProgress?.({ phase: "transcribing", current: 0, total: chunks.length })

    const runChunk = async (index: number): Promise<void> => {
        const chunk = chunks[index]
        const wav = encodeWAV(chunk.pcm, TARGET_SAMPLE_RATE)
        const res = await service.transcribe(wav)
        results[index] = {
            text: res.text,
            segments: res.segments.map((s) => ({
                start: s.start + chunk.startSec,
                end: s.end + chunk.startSec,
                text: s.text,
            })),
        }
        completed++
        onProgress?.({ phase: "transcribing", current: completed, total: chunks.length })
    }

    // Bounded-parallel runner
    let cursor = 0
    const workers: Promise<void>[] = []
    const next = async (): Promise<void> => {
        while (true) {
            const idx = cursor++
            if (idx >= chunks.length) return
            await runChunk(idx)
        }
    }
    for (let i = 0; i < Math.min(PARALLEL_LIMIT, chunks.length); i++) {
        workers.push(next())
    }
    await Promise.all(workers)

    const mergedText = results.map((r) => r.text).filter(Boolean).join(" ")
    const mergedSegments: SubtitleSegment[] = results.flatMap((r) => r.segments)

    return { text: mergedText, segments: mergedSegments }
}
