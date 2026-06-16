import { pickAudioStreams, type DouyinVideoData } from "./audioStreams"

export interface CachedAweme {
    id: string
    title: string
    author: string
    coverUrl: string
    audioStreams: string[]
}

// One active video per tab → module-level singleton cache.
let cached: CachedAweme | null = null

/** Synchronous read of the last-loaded aweme, only if it matches `id`. */
export function getCachedAweme(id: string): CachedAweme | null {
    return cached && cached.id === id ? cached : null
}

interface ReadPlayerResponse {
    ok: boolean
    awemeId?: string
    desc?: string
    author?: string
    cover?: string
    video?: DouyinVideoData
    reason?: string
}

/**
 * Ask the background SW to read window.player.config.awemeInfo (MAIN world)
 * and cache the normalized result for synchronous reads by DouyinService.
 */
export async function loadAweme(id: string): Promise<CachedAweme | null> {
    try {
        const res: ReadPlayerResponse = await chrome.runtime.sendMessage({
            type: "READ_DOUYIN_PLAYER",
            videoId: id
        })
        if (!res?.ok || res.awemeId !== id) {
            console.warn("[DouyinBridge] readPlayer failed:", res?.reason)
            return null
        }
        cached = {
            id,
            title: (res.desc || "").split("\n")[0].trim() || "Unknown Title",
            author: res.author || "Unknown Author",
            coverUrl: res.cover || "",
            audioStreams: pickAudioStreams(res.video),
        }
        return cached
    } catch (e) {
        console.error("[DouyinBridge] loadAweme error:", e)
        return null
    }
}

/** Ask the SW to call window.player.seek() in MAIN world. */
export function douyinSeek(seconds: number): void {
    chrome.runtime.sendMessage({ type: "DOUYIN_PLAYER_SEEK", seconds }).catch(() => {})
}
