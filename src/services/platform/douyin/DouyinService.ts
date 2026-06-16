import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../types"
import { extractAwemeId } from "./awemeId"
import { getCachedAweme, loadAweme, douyinSeek } from "./playerBridge"

export class DouyinService implements IPlatformService {
    getPlatformName(): string {
        return "douyin"
    }

    // id comes from URL (always available); title/author/cover come from the
    // player cache (populated asynchronously by the bridge); duration from the
    // <video> element (sync, reliable).
    detectVideo(): VideoInfo | null {
        const id = extractAwemeId(window.location.href)
        if (!id) return null
        const cached = getCachedAweme(id)
        const videoEl = document.querySelector("video")
        const dur = videoEl && !Number.isNaN(videoEl.duration) ? videoEl.duration : 0
        return {
            id,
            title: cached?.title || "Unknown Title",
            author: cached?.author || "Unknown Author",
            coverUrl: cached?.coverUrl || "",
            duration: dur,
        }
    }

    // Douyin has no machine-readable CC → always empty → SummaryPanel shows the
    // "summarize via ASR" button.
    async getSubtitles(): Promise<SubtitleSegment[]> {
        return []
    }

    // Comment DOM scraping is deferred to a separate plan; return empty for now.
    async getComments(): Promise<SampledComments> {
        return { consensus: [], controversial: [] }
    }

    supportsDigitalASR(): boolean {
        return true
    }

    async getAudioUrlCandidates(videoId: string): Promise<string[]> {
        const aweme = getCachedAweme(videoId) || (await loadAweme(videoId))
        return aweme?.audioStreams ?? []
    }

    async getAudioUrl(videoId: string): Promise<string | null> {
        return (await this.getAudioUrlCandidates(videoId))[0] ?? null
    }

    seekTo(seconds: number): void {
        douyinSeek(seconds)
    }
}
