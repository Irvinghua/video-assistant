import { BilibiliService } from "./bilibili/BilibiliService"
import { YouTubeService } from "./youtube/YouTubeService"
import type { IPlatformService } from "./types"

export class PlatformFactory {
    static getService(url: string): IPlatformService | null {
        if (url.includes("bilibili.com/video")) {
            return new BilibiliService()
        }
        if (url.includes("youtube.com/watch")) {
            return new YouTubeService()
        }
        return null
    }
}
