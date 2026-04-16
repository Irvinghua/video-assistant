/**
 * Decode + resample + slice + WAV-encode audio for Whisper ingestion.
 *
 * Whisper internally resamples to 16 kHz mono, so producing WAV at that
 * rate is both smallest-on-wire (25 MB ≈ 13 min) and lossless for the model.
 *
 * All functions run in content-script context (AudioContext is unavailable
 * in MV3 service workers).
 */

export const TARGET_SAMPLE_RATE = 16_000
export const CHUNK_SECONDS = 600 // 10 min × 16 kHz × 2 bytes ≈ 19.2 MB (< 25 MB limit)
export const MAX_DURATION_SECONDS = 4 * 3600 // 4 h hard cap

export interface DecodedAudio {
    pcm: Float32Array
    sampleRate: number
    durationSec: number
}

/**
 * Decode a compressed audio Blob (m4a/mp4/webm/opus) into 16 kHz mono PCM.
 * Uses AudioContext for format detection and OfflineAudioContext for resampling.
 */
export async function decodeToMonoPCM(blob: Blob): Promise<DecodedAudio> {
    const arrayBuffer = await blob.arrayBuffer()

    const ctx = new AudioContext()
    let decoded: AudioBuffer
    try {
        decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    } finally {
        ctx.close().catch(() => {})
    }

    const srcDuration = decoded.duration
    if (srcDuration > MAX_DURATION_SECONDS) {
        throw new Error(
            `Video too long for ASR (${(srcDuration / 3600).toFixed(1)} h, limit ${MAX_DURATION_SECONDS / 3600} h).`
        )
    }

    const targetLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE)
    const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE)

    // Mix to mono by averaging channels through a ChannelMergerNode-free path:
    // just sum and scale in-place using a GainNode fed by all channels.
    const source = offlineCtx.createBufferSource()
    source.buffer = decoded
    // Downmix via channelCountMode='explicit' + channelCount=1 tells Web Audio
    // to average all input channels automatically.
    const merger = offlineCtx.createGain()
    merger.gain.value = 1
    merger.channelCount = 1
    merger.channelCountMode = "explicit"
    merger.channelInterpretation = "speakers"
    source.connect(merger)
    merger.connect(offlineCtx.destination)
    source.start(0)

    const rendered = await offlineCtx.startRendering()
    const pcm = rendered.getChannelData(0)

    return {
        pcm: new Float32Array(pcm), // detach from underlying AudioBuffer
        sampleRate: TARGET_SAMPLE_RATE,
        durationSec: rendered.duration,
    }
}

/**
 * Slice a PCM buffer into time-aligned chunks.
 * Each chunk carries its absolute start offset in seconds for later timestamp merging.
 */
export interface PCMChunk {
    pcm: Float32Array
    startSec: number
}

export function sliceByDuration(
    audio: DecodedAudio,
    chunkSeconds: number = CHUNK_SECONDS
): PCMChunk[] {
    const samplesPerChunk = Math.floor(chunkSeconds * audio.sampleRate)
    const chunks: PCMChunk[] = []
    for (let i = 0; i < audio.pcm.length; i += samplesPerChunk) {
        const slice = audio.pcm.subarray(i, Math.min(i + samplesPerChunk, audio.pcm.length))
        chunks.push({
            pcm: slice,
            startSec: i / audio.sampleRate,
        })
    }
    return chunks
}

/**
 * Encode a mono Float32 PCM buffer as 16-bit PCM WAV.
 * Produces a standard 44-byte RIFF header + interleaved Int16 samples.
 */
export function encodeWAV(pcm: Float32Array, sampleRate: number): Blob {
    const byteRate = sampleRate * 2 // mono, 16-bit
    const dataSize = pcm.length * 2
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }

    writeStr(0, "RIFF")
    view.setUint32(4, 36 + dataSize, true)
    writeStr(8, "WAVE")
    writeStr(12, "fmt ")
    view.setUint32(16, 16, true)        // PCM fmt chunk size
    view.setUint16(20, 1, true)         // PCM format
    view.setUint16(22, 1, true)         // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, 2, true)         // block align
    view.setUint16(34, 16, true)        // bits per sample
    writeStr(36, "data")
    view.setUint32(40, dataSize, true)

    let offset = 44
    for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        offset += 2
    }

    return new Blob([buffer], { type: "audio/wav" })
}
