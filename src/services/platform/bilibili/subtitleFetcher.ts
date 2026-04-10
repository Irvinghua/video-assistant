import type { SubtitleSegment } from "../types"

interface BiliSubtitle {
    from: number
    to: number
    content: string
}

async function bgFetch(url: string, referer?: string): Promise<any> {
    // Fetch directly from content script context so browser cookies (Bilibili login)
    // are included automatically. Content scripts with host_permissions bypass CORS.
    const fullUrl = url.startsWith("//") ? `https:${url}` : url
    const res = await fetch(fullUrl, {
        credentials: "include",
        headers: {
            "Referer": referer || "https://www.bilibili.com",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    })
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

// ─── Lightweight MD5 (RFC 1321) ───────────────────────────────────────────────
// SubtleCrypto does not support MD5, so we need a pure-JS implementation.
function md5(input: string): string {
    function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
        a = (a + q + x + t) | 0
        return (((a << s) | (a >>> (32 - s))) + b) | 0
    }
    function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & c) | (~b & d), a, b, x, s, t)
    }
    function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & d) | (c & ~d), a, b, x, s, t)
    }
    function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(b ^ c ^ d, a, b, x, s, t)
    }
    function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(c ^ (b | ~d), a, b, x, s, t)
    }

    const bytes: number[] = []
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i)
        if (code < 0x80) {
            bytes.push(code)
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        } else {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
        }
    }

    const n = bytes.length
    bytes.push(0x80)
    while (bytes.length % 64 !== 56) bytes.push(0)
    const bitLen = n * 8
    bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0)

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476
    for (let i = 0; i < bytes.length; i += 64) {
        const w: number[] = []
        for (let j = 0; j < 16; j++) {
            const off = i + j * 4
            w[j] = bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)
        }
        let aa = a, bb = b, cc = c, dd = d

        a = ff(a, b, c, d, w[0], 7, -680876936); d = ff(d, a, b, c, w[1], 12, -389564586)
        c = ff(c, d, a, b, w[2], 17, 606105819); b = ff(b, c, d, a, w[3], 22, -1044525330)
        a = ff(a, b, c, d, w[4], 7, -176418897); d = ff(d, a, b, c, w[5], 12, 1200080426)
        c = ff(c, d, a, b, w[6], 17, -1473231341); b = ff(b, c, d, a, w[7], 22, -45705983)
        a = ff(a, b, c, d, w[8], 7, 1770035416); d = ff(d, a, b, c, w[9], 12, -1958414417)
        c = ff(c, d, a, b, w[10], 17, -42063); b = ff(b, c, d, a, w[11], 22, -1990404162)
        a = ff(a, b, c, d, w[12], 7, 1804603682); d = ff(d, a, b, c, w[13], 12, -40341101)
        c = ff(c, d, a, b, w[14], 17, -1502002290); b = ff(b, c, d, a, w[15], 22, 1236535329)

        a = gg(a, b, c, d, w[1], 5, -165796510); d = gg(d, a, b, c, w[6], 9, -1069501632)
        c = gg(c, d, a, b, w[11], 14, 643717713); b = gg(b, c, d, a, w[0], 20, -373897302)
        a = gg(a, b, c, d, w[5], 5, -701558691); d = gg(d, a, b, c, w[10], 9, 38016083)
        c = gg(c, d, a, b, w[15], 14, -660478335); b = gg(b, c, d, a, w[4], 20, -405537848)
        a = gg(a, b, c, d, w[9], 5, 568446438); d = gg(d, a, b, c, w[14], 9, -1019803690)
        c = gg(c, d, a, b, w[3], 14, -187363961); b = gg(b, c, d, a, w[8], 20, 1163531501)
        a = gg(a, b, c, d, w[13], 5, -1444681467); d = gg(d, a, b, c, w[2], 9, -51403784)
        c = gg(c, d, a, b, w[7], 14, 1735328473); b = gg(b, c, d, a, w[12], 20, -1926607734)

        a = hh(a, b, c, d, w[5], 4, -378558); d = hh(d, a, b, c, w[8], 11, -2022574463)
        c = hh(c, d, a, b, w[11], 16, 1839030562); b = hh(b, c, d, a, w[14], 23, -35309556)
        a = hh(a, b, c, d, w[1], 4, -1530992060); d = hh(d, a, b, c, w[4], 11, 1272893353)
        c = hh(c, d, a, b, w[7], 16, -155497632); b = hh(b, c, d, a, w[10], 23, -1094730640)
        a = hh(a, b, c, d, w[13], 4, 681279174); d = hh(d, a, b, c, w[0], 11, -358537222)
        c = hh(c, d, a, b, w[3], 16, -722521979); b = hh(b, c, d, a, w[6], 23, 76029189)
        a = hh(a, b, c, d, w[9], 4, -640364487); d = hh(d, a, b, c, w[12], 11, -421815835)
        c = hh(c, d, a, b, w[15], 16, 530742520); b = hh(b, c, d, a, w[2], 23, -995338651)

        a = ii(a, b, c, d, w[0], 6, -198630844); d = ii(d, a, b, c, w[7], 10, 1126891415)
        c = ii(c, d, a, b, w[14], 15, -1416354905); b = ii(b, c, d, a, w[5], 21, -57434055)
        a = ii(a, b, c, d, w[12], 6, 1700485571); d = ii(d, a, b, c, w[3], 10, -1894986606)
        c = ii(c, d, a, b, w[10], 15, -1051523); b = ii(b, c, d, a, w[1], 21, -2054922799)
        a = ii(a, b, c, d, w[8], 6, 1873313359); d = ii(d, a, b, c, w[15], 10, -30611744)
        c = ii(c, d, a, b, w[6], 15, -1560198380); b = ii(b, c, d, a, w[13], 21, 1309151649)
        a = ii(a, b, c, d, w[4], 6, -145523070); d = ii(d, a, b, c, w[11], 10, -1120210379)
        c = ii(c, d, a, b, w[2], 15, 718787259); b = ii(b, c, d, a, w[9], 21, -343485551)

        a = (a + aa) | 0; b = (b + bb) | 0; c = (c + cc) | 0; d = (d + dd) | 0
    }

    const hex = (n: number) => {
        let s = ""
        for (let i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, "0")
        return s
    }
    return hex(a) + hex(b) + hex(c) + hex(d)
}

// ─── WBI Signing ──────────────────────────────────────────────────────────────
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
]

function getMixinKey(imgKey: string, subKey: string): string {
    const raw = imgKey + subKey
    return mixinKeyEncTab.map(i => raw[i]).join("").slice(0, 32)
}

let wbiKeysCache: { imgKey: string; subKey: string; ts: number } | null = null

async function getWbiKeys(referer: string): Promise<{ imgKey: string; subKey: string }> {
    // Cache for 10 minutes
    if (wbiKeysCache && Date.now() - wbiKeysCache.ts < 600_000) {
        return { imgKey: wbiKeysCache.imgKey, subKey: wbiKeysCache.subKey }
    }
    const nav = await bgFetch("https://api.bilibili.com/x/web-interface/nav", referer)
    const imgUrl: string = nav?.data?.wbi_img?.img_url || ""
    const subUrl: string = nav?.data?.wbi_img?.sub_url || ""
    // Extract key from URL filename (remove path and extension)
    const imgKey = imgUrl.split("/").pop()?.split(".")[0] || ""
    const subKey = subUrl.split("/").pop()?.split(".")[0] || ""
    if (!imgKey || !subKey) throw new Error("Failed to get WBI keys from nav API")
    wbiKeysCache = { imgKey, subKey, ts: Date.now() }
    console.log(`[BilibiliService] WBI keys fetched: img=${imgKey.slice(0, 8)}..., sub=${subKey.slice(0, 8)}...`)
    return { imgKey, subKey }
}

function signWbiParams(params: Record<string, string | number>, mixinKey: string): string {
    const wts = Math.floor(Date.now() / 1000)
    const allParams: Record<string, string | number> = { ...params, wts }
    // Sort by key and build query string
    const sorted = Object.keys(allParams).sort().map(k => {
        // Filter characters not in [a-zA-Z0-9!'\(\)*-._~]
        const v = String(allParams[k]).replace(/[^a-zA-Z0-9!'()*\-._~]/g, encodeURIComponent)
        return `${k}=${v}`
    }).join("&")
    const wRid = md5(sorted + mixinKey)
    return sorted + `&w_rid=${wRid}`
}

/**
 * Try to extract subtitles from page HTML/JS (similar to YouTube approach)
 * This is useful when API doesn't return subtitles but they're embedded in the page
 */
async function getSubtitlesFromPage(bvid: string): Promise<any[]> {
    try {
        console.log(`[BilibiliService] Attempting to extract subtitles from page HTML for ${bvid}`)

        // Try to get page HTML
        const pageData = await bgFetch(`https://www.bilibili.com/video/${bvid}`)
        const html = typeof pageData === 'string' ? pageData : JSON.stringify(pageData)

        // Look for __INITIAL_STATE__ or similar patterns
        const initialStateMatch = html.match(/__INITIAL_STATE__\s*=\s*({[\s\S]*?});/)
        if (initialStateMatch) {
            try {
                const initialState = JSON.parse(initialStateMatch[1])
                // Navigate to subtitle data - the path might vary
                const videoData = initialState?.videoData || initialState
                const subtitles = videoData?.subtitle?.list || videoData?.subtitle?.subtitles

                if (subtitles && subtitles.length > 0) {
                    console.log(`[BilibiliService] Found ${subtitles.length} subtitle tracks in page __INITIAL_STATE__`)
                    return subtitles
                }
            } catch (e) {
                console.log(`[BilibiliService] Failed to parse __INITIAL_STATE__: ${e.message}`)
            }
        }

        // Look for videoInfo pattern
        const videoInfoMatch = html.match(/"videoInfo":\s*({[^}]*})/)
        if (videoInfoMatch) {
            try {
                const videoInfo = JSON.parse(videoInfoMatch[1])
                const subtitles = videoInfo?.subtitle?.list || videoInfo?.subtitle?.subtitles

                if (subtitles && subtitles.length > 0) {
                    console.log(`[BilibiliService] Found ${subtitles.length} subtitle tracks in page videoInfo`)
                    return subtitles
                }
            } catch (e) {
                console.log(`[BilibiliService] Failed to parse videoInfo: ${e.message}`)
            }
        }

        console.log(`[BilibiliService] No subtitles found in page HTML`)
        return []
    } catch (e) {
        console.error(`[BilibiliService] Error extracting from page: ${e.message}`)
        return []
    }
}

export async function getBilibiliSubtitles(bvid: string): Promise<SubtitleSegment[]> {
    try {
        console.log(`[BilibiliService] Starting subtitle search for ${bvid}`)
        const videoUrl = `https://www.bilibili.com/video/${bvid}`
        
        // 1. Get Base Info (cid/aid needed for WBI call)
        const viewData = await bgFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, videoUrl)
        const cid = viewData?.data?.cid
        const aid = viewData?.data?.aid

        if (!cid) return []

        // 2. Use WBI-signed endpoint only (unsigned /v2 returns wrong subtitle URLs)
        let allPossibleSubtitles: any[] = []

        try {
            const { imgKey, subKey } = await getWbiKeys(videoUrl)
            const mixinKey = getMixinKey(imgKey, subKey)
            const wbiQuery = signWbiParams({
                bvid: bvid,
                cid: cid,
                isGaiaAvoided: "false",
                web_location: 1315873,
                dm_img_str: "V2ViR0w=",
                dm_cover_img_str: "QU5HTEUgKEFwcGxlLCBBTkdMRSBNZXRhbCBSZW5kZXJlcjogQXBwbGUgTTEgUHJvLCBVbnNwZWNpZmllZCBWZXJzaW9uKUdvb2dsZSBJbmMuIChBcHBsZSk=",
                dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}'
            }, mixinKey)
            console.log(`[BilibiliService] WBI query built, calling /x/player/wbi/v2`)
            const v2Data = await bgFetch(`https://api.bilibili.com/x/player/wbi/v2?${wbiQuery}`, videoUrl)
            if (v2Data?.code !== 0) {
                console.error(`[BilibiliService] WBI V2 returned error code: ${v2Data?.code}, message: ${v2Data?.message}`)
            }
            const v2Subs = v2Data?.data?.subtitle?.subtitles || []
            if (v2Subs.length > 0) {
                console.log(`[BilibiliService] Found ${v2Subs.length} subtitle tracks in Player WBI V2`)
                allPossibleSubtitles = [...v2Subs]
            } else {
                console.log(`[BilibiliService] Player WBI V2 returned 0 subtitle tracks`)
            }
        } catch (e) {
            console.error(`[BilibiliService] Player WBI V2 error:`, e)
        }

        // 3. De-duplicate and filter out tracks with empty URLs
        const validSubs = allPossibleSubtitles.filter(s => s.subtitle_url && s.subtitle_url.length > 0)
        const uniqueSubs = Array.from(new Map(validSubs.map(s => [s.lan, s])).values())
        console.log(`[BilibiliService] Total valid unique tracks: ${uniqueSubs.length} (${uniqueSubs.map(s => s.lan).join(', ')})`)

        if (uniqueSubs.length > 0) {
            // CRITICAL: Avoid AI-generated subtitles (ai-zh) as they may contain incorrect content
            // Priority Selection: zh-Hans > zh-CN > zh-HK > zh-TW > any non-AI zh > en > ai-zh (last resort)
            const bestSubtitle = uniqueSubs.find(s => s.lan === "zh-Hans" && !s.lan.startsWith("ai-"))
                || uniqueSubs.find(s => s.lan === "zh-CN" && !s.lan.startsWith("ai-"))
                || uniqueSubs.find(s => s.lan?.startsWith("zh") && !s.lan.startsWith("ai-"))
                || uniqueSubs.find(s => s.lan?.startsWith("en") && !s.lan.startsWith("ai-"))
                || uniqueSubs.find(s => !s.lan?.startsWith("ai-"))  // Any non-AI track
                || uniqueSubs.find(s => s.lan === "ai-zh")  // Last resort: AI track
                || uniqueSubs[0]

            console.log(`[BilibiliService] Selected track: ${bestSubtitle.lan}`)
            if (bestSubtitle.lan?.startsWith("ai-")) {
                console.warn(`[BilibiliService] ⚠️ WARNING: Selected AI-generated subtitle track (${bestSubtitle.lan}), which may contain incorrect content`)
                console.warn(`[BilibiliService] Recommend using ASR feature for accurate subtitles`)
            } else {
                console.log(`[BilibiliService] ✅ Selected non-AI subtitle track (${bestSubtitle.lan})`)
            }
            console.log(`[BilibiliService] URL: ${bestSubtitle.subtitle_url}`)
            return await fetchFromSubtitleUrl(bestSubtitle.subtitle_url, videoUrl)
        }

        console.warn(`[BilibiliService] No subtitles found for ${bvid} via WBI endpoint.`)
        return []

    } catch (error) {
        console.error("[BilibiliService] Subtitle fetch failed:", error)
        return []
    }
}

async function fetchFromSubtitleUrl(url: string, referer: string): Promise<SubtitleSegment[]> {
    if (!url) {
        console.error("[BilibiliService] Empty subtitle URL provided")
        return []
    }

    const subUrl = url.startsWith("//") ? `https:${url}` : url
    console.log(`[BilibiliService] Fetching subtitle from: ${subUrl}`)

    try {
        // CDN subtitle URLs use signed auth_key — do NOT send credentials (causes CORS failure)
        const res = await fetch(subUrl, { credentials: "omit" })
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
        const subData = await res.json()

        // Handle different subtitle formats
        if (subData && Array.isArray(subData.body)) {
            console.log(`[BilibiliService] Got subtitle data with ${subData.body.length} segments`)
            const segments = subData.body
                .filter((item: BiliSubtitle) => item.content && item.content.trim().length > 0)
                .map((item: BiliSubtitle) => ({
                    start: item.from,
                    end: item.to,
                    text: item.content.trim()
                }))
            console.log(`[BilibiliService] Parsed ${segments.length} valid subtitle segments`)

            // CRITICAL: Log subtitle content preview for verification
            if (segments.length > 0) {
                console.log(`[BilibiliService] 🔍 SUBTITLE CONTENT PREVIEW:`)
                const previewCount = Math.min(3, segments.length)
                for (let i = 0; i < previewCount; i++) {
                    const seg = segments[i]
                    console.log(`[BilibiliService]   [${i + 1}] ${formatTime(seg.start)}: "${seg.text.substring(0, 60)}..."`)
                }
                if (segments.length > 3) {
                    console.log(`[BilibiliService]   ... and ${segments.length - 3} more segments`)
                }

                // Check for common wrong subtitle patterns
                const fullText = segments.map(s => s.text).join(' ')
                if (fullText.includes('小米SU7') || fullText.includes('小米汽车')) {
                    console.warn(`[BilibiliService] ⚠️  WARNING: Subtitle content contains '小米SU7' references`)
                    console.warn(`[BilibiliService] This suggests the subtitle track may be for a different video`)
                }
            }

            return segments
        } else if (subData && typeof subData === 'object') {
            // Try to find alternative formats
            console.log("[BilibiliService] Unexpected subtitle format, attempting to parse...")
            // Log the structure for debugging
            console.log("[BilibiliService] Subtitle data structure:", Object.keys(subData))
        }
    } catch (e) {
        console.error("[BilibiliService] Error parsing subtitle content:", e)
    }

    console.error("[BilibiliService] Failed to parse subtitle data from URL")
    return []
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}
