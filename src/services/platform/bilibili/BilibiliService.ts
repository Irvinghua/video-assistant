import type { IPlatformService, VideoInfo, SubtitleSegment, Comment } from "../types"
import { getBilibiliSubtitles } from "./subtitleFetcher"
import { getBilibiliComments } from "./commentFetcher"

export class BilibiliService implements IPlatformService {
    getPlatformName(): string {
        return "bilibili"
    }

    detectVideo(): VideoInfo | null {
        const url = window.location.href
        const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
        let bvid = bvidMatch ? bvidMatch[1] : null

        if (!bvid) {
            const playerEl = document.querySelector('#bilibili-player') || document.querySelector('.bpx-player-container')
            const attrBvid = playerEl?.getAttribute('data-bvid')
            if (attrBvid) bvid = attrBvid
        }

        if (!bvid) return null

        const titleElement = document.querySelector(".video-title") || document.querySelector("h1.tit")
        const authorElement = document.querySelector(".up-name") || document.querySelector(".username")

        return {
            id: bvid,
            title: titleElement?.textContent?.trim() || "Unknown Title",
            author: authorElement?.textContent?.trim() || "Unknown Author",
            coverUrl: "", 
            duration: 0 
        }
    }

    async getSubtitles(videoId: string): Promise<SubtitleSegment[]> {
        return getBilibiliSubtitles(videoId)
    }

    async getComments(videoId: string, limit: number = 100): Promise<Comment[]> {
        return getBilibiliComments(videoId, limit)
    }

    supportsDigitalASR(): boolean {
        return true
    }

    async getAudioUrl(bvid: string): Promise<string | null> {
        try {
            console.log(`[BilibiliService] Getting audio URL for ${bvid}`)
            const viewData = await this.bgFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
            const cid = viewData?.data?.cid
            if (!cid) return null

            // Get DASH playurl
            const playUrlData = await this.bgFetch(
                `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnval=16`
            )

            // Dash audio usually has better quality and is more stable
            let audioUrl = playUrlData?.data?.dash?.audio?.[0]?.baseUrl 
                || playUrlData?.data?.dash?.audio?.[0]?.base_url

            // Fallback to flv/mp4 audio if dash is not available
            if (!audioUrl && playUrlData?.data?.durl?.[0]?.url) {
                audioUrl = playUrlData.data.durl[0].url
            }
            
            console.log(`[BilibiliService] Found audio URL: ${audioUrl ? 'Yes' : 'No'}`)
            return audioUrl || null
        } catch (e) {
            console.error("[BilibiliService] Failed to get audio URL:", e)
            return null
        }
    }

    private async bgFetch(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: "FETCH_API", url },
                (response) => {
                    if (response?.success) resolve(response.data)
                    else reject(new Error(response?.error || "Fetch failed"))
                }
            )
        })
    }

    seekTo(seconds: number): void {
        const video = document.querySelector("video")
        if (video) {
            video.currentTime = seconds
            video.play()
        }
    }
}
