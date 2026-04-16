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

export interface PipelineProgress {
    phase: "decoding" | "transcribing"
    /** 1-indexed current chunk when phase === "transcribing" */
    current?: number
    total?: number
}

/**
 * Transcribe arbitrarily long audio by:
 *   1. Decoding to 16 kHz mono PCM (content-script AudioContext).
 *   2. Slicing into ~10 min chunks and WAV-encoding each.
 *   3. Transcribing chunks with bounded parallelism.
 *   4. Merging per-chunk segments with absolute-time offsets.
 *
 * Short audio that already fits Whisper's 25 MB limit still flows through
 * the same pipeline for a uniform code path; the overhead is a single decode.
 */
export async function transcribeLongAudio(
    audioBlob: Blob,
    onProgress?: (p: PipelineProgress) => void
): Promise<TranscriptResult> {
    onProgress?.({ phase: "decoding" })
    const decoded = await decodeToMonoPCM(audioBlob)
    const chunks = sliceByDuration(decoded, CHUNK_SECONDS)

    const service = await ASRServiceFactory.getService()

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
