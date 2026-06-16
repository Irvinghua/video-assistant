interface DouyinUrlItem { src?: string }
interface DouyinAudioStream { bitrate?: number; urlList?: DouyinUrlItem[] }

export interface DouyinVideoData {
    bitRateAudioList?: DouyinAudioStream[]
    playAddr?: { urlList?: DouyinUrlItem[] } | Array<DouyinUrlItem | string> | null
}

/**
 * Ordered candidate audio download URLs for ASR.
 * Prefers the lowest-bitrate audio-only DASH stream; falls back to the
 * progressive MP4 (which also carries audio). Returns CDN `.src` URLs ONLY —
 * never the same-origin `playApi` (it returns a captcha page).
 */
export function pickAudioStreams(video: DouyinVideoData | null | undefined): string[] {
    if (!video) return []

    const audioList = video.bitRateAudioList || []
    if (audioList.length > 0) {
        const picked = [...audioList].sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))[0]
        const srcs = (picked?.urlList || []).map(u => u.src).filter((s): s is string => !!s)
        if (srcs.length) return srcs
    }

    const pa = video.playAddr
    const items: Array<DouyinUrlItem | string> = Array.isArray(pa) ? pa : (pa?.urlList || [])
    return items
        .map(it => (typeof it === "string" ? it : it?.src))
        .filter((s): s is string => !!s)
}
