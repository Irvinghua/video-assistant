export type CacheDataType = "summary" | "comments" | "subtitles" | "mindmap" | "sampledcomments"

export interface CacheEntry<T> {
    key: string
    data: T
    createdAt: number
    expiresAt: number
    platform: "bilibili" | "youtube" | "douyin"
    videoId: string
    dataType: CacheDataType
}

export interface ICacheService {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, data: T, ttlSeconds: number): Promise<void>
    remove(key: string): Promise<void>
    clearExpired(): Promise<void>
    clearAll(): Promise<void>
}
