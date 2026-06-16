import { BilibiliService } from "./bilibili/BilibiliService"
import { YouTubeService } from "./youtube/YouTubeService"
import { DouyinService } from "./douyin/DouyinService"
import type { IPlatformService } from "./types"

export class PlatformFactory {
    static getService(url: string): IPlatformService | null {
        if (url.includes("bilibili.com/video")) {
            return new BilibiliService()
        }
        if (url.includes("youtube.com/watch")) {
            return new YouTubeService()
        }
        if (url.includes("douyin.com")) {
            try {
                const u = new URL(url)
                if (/\/video\/\d+/.test(u.pathname) || u.searchParams.has("modal_id")) {
                    return new DouyinService()
                }
            } catch {
                // ignore malformed URL
            }
        }
        return null
    }
}
