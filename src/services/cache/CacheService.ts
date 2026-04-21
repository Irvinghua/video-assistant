import type { CacheDataType, CacheEntry, ICacheService } from "./types"

const DEFAULT_TTL = 3 * 24 * 60 * 60 // 3 days
const CACHE_KEY_PATTERN = /^(youtube|bilibili):[^:]+:(summary|comments|subtitles|mindmap|sampledcomments)$/

/** Typed wrappers to help TS pick the MV3 Promise overloads */
const storageGetAll = () => chrome.storage.local.get(null as unknown as string) as Promise<Record<string, any>>
const storageGetBytes = () => (chrome.storage.local.getBytesInUse as (keys: null) => Promise<number>)(null)

/** Type-safe cache key builders — single source of truth for all cache keys. */
export const cacheKeys = {
    summary: (platform: string, videoId: string) => `${platform}:${videoId}:summary`,
    mindmap: (platform: string, videoId: string) => `${platform}:${videoId}:mindmap`,
    comments: (platform: string, videoId: string) => `${platform}:${videoId}:comments`,
    subtitle: (platform: string, videoId: string) => `${platform}:${videoId}:subtitles`,
    sampledComments: (platform: string, videoId: string) => `${platform}:${videoId}:sampledcomments`,
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
            await this.evictIfNeeded()

            const parts = key.split(":")
            const videoId = parts[1] || ""
            const platform = (parts[0] || "youtube") as "bilibili" | "youtube"
            const dataType = (parts[2] as CacheDataType) || "summary"

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

    /**
     * Batch-read multiple keys in a single chrome.storage.local.get() IPC call.
     * Returns a map of key → data (null if missing/expired/mismatched).
     */
    async getBatch(keys: string[]): Promise<Record<string, any>> {
        const result: Record<string, any> = {}
        try {
            const raw = await chrome.storage.local.get(keys)
            const now = Date.now()
            const expiredKeys: string[] = []
            for (const key of keys) {
                const entry = raw[key] as CacheEntry<any> | undefined
                if (!entry) { result[key] = null; continue }
                const expectedVideoId = key.split(":")[1]
                if (entry.videoId !== expectedVideoId) {
                    expiredKeys.push(key)
                    result[key] = null
                    continue
                }
                if (now > entry.expiresAt) {
                    expiredKeys.push(key)
                    result[key] = null
                    continue
                }
                result[key] = entry.data
            }
            if (expiredKeys.length > 0) await chrome.storage.local.remove(expiredKeys)
        } catch (e) {
            console.error("[CacheService] getBatch error:", e)
            for (const key of keys) result[key] = null
        }
        return result
    }

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key)
    }

    async clearExpired(): Promise<void> {
        const all = await storageGetAll()
        const now = Date.now()
        const keysToRemove = Object.keys(all).filter(key => {
            if (!CACHE_KEY_PATTERN.test(key)) return false
            const entry = all[key] as CacheEntry<any>
            return entry?.expiresAt && now > entry.expiresAt
        })
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove)
            console.log(`[CacheService] Cleared ${keysToRemove.length} expired entries`)
        }
    }

    async clearAll(): Promise<void> {
        try {
            console.log("[CacheService] Clearing all cache entries (preserving user config)...")
            const all = await storageGetAll()
            const cacheKeysToRemove = Object.keys(all).filter(k => CACHE_KEY_PATTERN.test(k))
            if (cacheKeysToRemove.length > 0) {
                await chrome.storage.local.remove(cacheKeysToRemove)
            }
            chrome.runtime.sendMessage({ type: "CACHE_CLEARED" })
            console.log(`[CacheService] Removed ${cacheKeysToRemove.length} cache entries`)
        } catch (e) {
            console.error("[CacheService] ClearAll failed", e)
        }
    }

    /**
     * Evict oldest cache entries when storage approaches the 10 MB limit.
     * Called before every set() to ensure writes don't silently fail.
     */
    async evictIfNeeded(reserveBytes = 512 * 1024): Promise<void> {
        const QUOTA = 10 * 1024 * 1024 // chrome.storage.local default 10 MB
        const used = await storageGetBytes()
        if (used + reserveBytes < QUOTA) return

        console.warn(`[CacheService] Storage ${(used / 1024 / 1024).toFixed(1)} MB — evicting oldest entries`)
        const all = await storageGetAll()
        const entries = Object.entries(all)
            .filter(([k]) => CACHE_KEY_PATTERN.test(k))
            .map(([k, v]) => ({ key: k, createdAt: (v as CacheEntry<any>).createdAt ?? 0 }))
            .sort((a, b) => a.createdAt - b.createdAt)

        let freed = 0
        const keysToRemove: string[] = []
        for (const entry of entries) {
            if (used - freed + reserveBytes < QUOTA) break
            const raw = JSON.stringify(all[entry.key])
            freed += raw.length * 2 // rough byte estimate (UTF-16)
            keysToRemove.push(entry.key)
        }
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove)
            console.log(`[CacheService] Evicted ${keysToRemove.length} entries, ~${(freed / 1024).toFixed(0)} KB freed`)
        }
    }
}

export const cacheService = new CacheService()
