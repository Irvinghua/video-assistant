import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../types"
import { getYouTubeSubtitles } from "./subtitleFetcher"
import { getYouTubeComments } from "./commentFetcher"
import { getYouTubeAudioUrl } from "./audioFetcher"

export class YouTubeService implements IPlatformService {
    getPlatformName(): string {
        return "youtube"
    }

    private log(msg: string) {
        console.log(`[YouTubeService] ${msg}`)
    }

    detectVideo(): VideoInfo | null {
        const url = window.location.href
        if (!url.includes("youtube.com/watch")) return null

        const urlParams = new URLSearchParams(window.location.search)
        const videoId = urlParams.get("v")
        if (!videoId) return null

        const title = document.querySelector("h1.ytd-video-primary-info-renderer")?.textContent?.trim()
            || document.querySelector("yt-formatted-string.ytd-video-primary-info-renderer")?.textContent?.trim()
            || document.title.replace(" - YouTube", "")

        return {
            id: videoId,
            title: title || "Unknown Title",
            author: document.querySelector("ytd-channel-name a")?.textContent?.trim() || "Unknown Author",
            coverUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            duration: 0
        }
    }

    async getSubtitles(videoId: string): Promise<SubtitleSegment[]> {
        this.log(`Attempting to get subtitles for ${videoId}`)
        try {
            const subs = await getYouTubeSubtitles(videoId)
            this.log(`Successfully got ${subs?.length || 0} subtitle segments`)
            return subs || []
        } catch (e) {
            this.log(`Error in getSubtitles: ${(e as Error).message}`)
            return []
        }
    }

    async getComments(videoId: string): Promise<SampledComments> {
        this.log(`Attempting to get comments for ${videoId}`)
        try {
            const sampled = await getYouTubeComments(videoId)
            this.log(`Sampled: consensus=${sampled.consensus.length}, controversial=${sampled.controversial.length}`)
            return sampled
        } catch (e) {
            this.log(`Error in getComments: ${(e as Error).message}`)
            return { consensus: [], controversial: [] }
        }
    }

    supportsDigitalASR(): boolean {
        return false
    }

    async getAudioUrl(videoId: string): Promise<string | null> {
        this.log(`Getting audio URL for ${videoId}`)
        return getYouTubeAudioUrl(videoId)
    }

    seekTo(seconds: number): void {
        const video = document.querySelector("video")
        if (video) {
            video.currentTime = seconds
            video.play()
        }
    }
}
