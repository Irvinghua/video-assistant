import { Storage } from "@plasmohq/storage"

import type { Comment } from "../types"

const storage = new Storage()

export async function getYouTubeComments(videoId: string, limit: number = 100): Promise<Comment[]> {
    try {
        const apiKeys = await storage.get("apiKeys") || {}
        const apiKey = apiKeys["Google Maps"] || apiKeys["YouTube"] || apiKeys["Gemini"] // Just trying related keys? No, user explicitly set keys.
        // In options.tsx we didn't have a specific "YouTube API Key". 
        // Usually Google Cloud Key for Gemini might work if scopes overlap, but better to have separate.
        // For now, let's assume user puts it in "YouTube" key if we add it, or re-use "Gemini" if they are same project.
        // Actually, in options.tsx I only added "Gemini", "ChatGPT" etc model keys.
        // I should probably add a "YouTube Data API Key" field in options, or just reuse one.
        // Or ask user to provide it.

        // For now, let's look for a key named "YouTube" in the dynamic map.
        const key = apiKeys["YouTube"]

        if (!key) {
            console.warn("YouTube Data API Key not found. Comments will not be fetched.")
            return []
        }

        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${Math.min(limit, 100)}&key=${key}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.error) {
            console.error("YouTube Data API error:", data.error.message)
            return []
        }

        return (data.items || []).map((item: any) => {
            const snippet = item.snippet.topLevelComment.snippet
            return {
                id: item.id,
                user: snippet.authorDisplayName,
                text: snippet.textDisplay,
                likes: snippet.likeCount,
                date: new Date(snippet.publishedAt).getTime(),
                replies: item.snippet.totalReplyCount
            }
        })

    } catch (error) {
        console.error("Error fetching YouTube comments:", error)
        return []
    }
}
