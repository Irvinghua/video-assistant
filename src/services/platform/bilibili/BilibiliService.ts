import type { IPlatformService, VideoInfo, SubtitleSegment, SampledComments } from "../types"
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

    async getComments(videoId: string): Promise<SampledComments> {
        return getBilibiliComments(videoId)
    }

    supportsDigitalASR(): boolean {
        return true
    }

    async getAudioUrl(bvid: string): Promise<string | null> {
        const urls = await this.getAudioUrlCandidates(bvid)
        return urls[0] ?? null
    }

    /**
     * Return a list of candidate audio URLs (base_url first, then backup_url[]).
     * Callers should try each in order until one succeeds.
     */
    async getAudioUrlCandidates(bvid: string): Promise<string[]> {
        try {
            console.log(`[BilibiliService] Getting audio URL candidates for ${bvid}`)

            // Resolve cid for the current page (supports multi-P via ?p=N)
            const viewData = await this.bgFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
            const params = new URLSearchParams(window.location.search)
            const pIdx = Math.max(1, parseInt(params.get("p") || "1", 10))
            const cid = viewData?.data?.pages?.[pIdx - 1]?.cid ?? viewData?.data?.cid
            if (!cid) return []

            const playUrlData = await this.bgFetch(
                `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnval=16`
            )

            const audioList: any[] = playUrlData?.data?.dash?.audio || []
            if (audioList.length > 0) {
                // Pick the lowest-bitrate stream — ASR only needs 16kHz mono,
                // so 64kbps AAC (id=30216) is plenty and saves download/memory cost.
                const sorted = [...audioList].sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0))
                const picked = sorted.find((s) => s.id === 30216) || sorted[0]
                console.log(
                    `[BilibiliService] Picked audio id=${picked.id} bandwidth=${picked.bandwidth}`
                )

                const primary = picked.base_url || picked.baseUrl
                const backups: string[] = picked.backup_url || picked.backupUrl || []
                return [primary, ...backups].filter(Boolean)
            }

            // Legacy FLV/MP4 fallback (very old videos without DASH)
            const durlUrl = playUrlData?.data?.durl?.[0]?.url
            if (durlUrl) return [durlUrl]

            return []
        } catch (e) {
            console.error("[BilibiliService] Failed to get audio URL candidates:", e)
            return []
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
