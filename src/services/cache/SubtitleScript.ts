import type { SubtitleSegment } from "../platform/types"
import { cacheService, cacheKeys } from "./CacheService"

/**
 * Reads cached subtitles and converts them to a plain-text script
 * (no timestamps), suitable for use as AI prompt context.
 */
export async function getPlainScript(platform: string, videoId: string): Promise<string | null> {
    const subs = await cacheService.get<SubtitleSegment[]>(cacheKeys.subtitle(platform, videoId))
    if (!subs || subs.length === 0) return null
    return subs.map(s => s.text).join("\n")
}
