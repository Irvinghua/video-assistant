import type { CacheEntry, ICacheService } from "./types"

const DEFAULT_TTL = 3 * 24 * 60 * 60 // 3 days

/** Type-safe cache key builders — single source of truth for all cache keys. */
export const cacheKeys = {
    summary: (platform: string, videoId: string) => `${platform}:${videoId}:summary`,
    mindmap: (platform: string, videoId: string) => `${platform}:${videoId}:mindmap`,
    comments: (platform: string, videoId: string) => `${platform}:${videoId}:comments`,
}

/**
 * Enhanced CacheService with explicit VideoID validation 
 * to prevent cross-video data leakage.
 */
class CacheService implements ICacheService {
    async get<T>(key: string): Promise<T | null> {
        try {
            // key format: "platform:videoId:type"
            const parts = key.split(":")
            const expectedVideoId = parts[1]

            const result = await chrome.storage.local.get(key)
            const entry = result[key] as CacheEntry<T>

            if (!entry) return null

            // CRITICAL: Double check that the data inside the entry belongs to the video we asked for
            if (entry.videoId !== expectedVideoId) {
                console.error(`[CacheService] CRITICAL: Data mismatch! Expected ${expectedVideoId} but got ${entry.videoId}. Deleting stale key.`)
                await this.remove(key)
                return null
            }

            if (Date.now() > entry.expiresAt) {
                console.log(`[CacheService] Expired: ${key}`)
                await this.remove(key)
                return null
            }

            return entry.data as T
        } catch (e) {
            console.error("[CacheService] Get error:", e)
            return null
        }
    }

    async set<T>(key: string, data: T, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
        try {
            const parts = key.split(":")
            const videoId = parts[1] || ""
            const platform = key.startsWith("bilibili") ? "bilibili" : "youtube"
            const dataType = parts[2] as any || "summary"

            const now = Date.now()
            const entry: CacheEntry<T> = {
                key,
                data,
                createdAt: now,
                expiresAt: now + ttlSeconds * 1000,
                platform,
                videoId, // Ensure VideoID is baked into the payload
                dataType
            }
            await chrome.storage.local.set({ [key]: entry })
            console.log(`[CacheService] SECURE SAVE: ${key} for video ${videoId}`)
        } catch (e) {
            console.error("[CacheService] Set error:", e)
        }
    }

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key)
    }

    async clearExpired(): Promise<void> {
        const all = await chrome.storage.local.get(null)
        const now = Date.now()
        const keysToRemove = Object.keys(all).filter(key => {
            const entry = all[key] as CacheEntry<any>
            return entry?.expiresAt && now > entry.expiresAt
        })
        if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove)
    }

    async clearAll(): Promise<void> {
        try {
            console.log("[CacheService] FORCE CLEARING ALL STORAGE...")
            await chrome.storage.local.clear()
            // Also notify tabs
            chrome.runtime.sendMessage({ type: "CACHE_CLEARED" })
            console.log("[CacheService] STORAGE IS NOW EMPTY")
        } catch (e) {
            console.error("[CacheService] ClearAll failed", e)
        }
    }
}

export const cacheService = new CacheService()
