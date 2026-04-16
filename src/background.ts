export { }

console.log("[VA] Background Service Worker Loaded")

// ─── In-memory cache for player JS cipher functions (per SW lifecycle) ───
const playerJsCache = new Map<string, string>() // url → js text

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FETCH_API") {
        handleFetch(message, sendResponse)
        return true
    }

    if (message.type === "FETCH_YOUTUBE_SUBTITLES") {
        const tabId = sender.tab?.id
        if (!tabId) {
            sendResponse({ success: false, error: "No tab ID available" })
            return true
        }
        handleYouTubeSubtitles(message.videoId, tabId, sendResponse)
        return true
    }

    if (message.type === "FETCH_YOUTUBE_AUDIO_URL") {
        const tabId = sender.tab?.id
        if (!tabId) {
            sendResponse({ success: false, error: "No tab ID available" })
            return true
        }
        handleYouTubeAudioUrl(message.videoId, tabId, sendResponse)
        return true
    }
})

// ─── YouTube Subtitles via scripting.executeScript in page main world ───

async function handleYouTubeSubtitles(videoId: string, tabId: number, sendResponse: (r: any) => void) {
    try {
        console.log(`[VA-BG] Fetching subtitles for ${videoId} via page main world (tabId=${tabId})`)

        // Step 1: Read baseUrl from ytInitialPlayerResponse in MAIN world (no fetch here)
        const urlResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (_vid: string) => {
                try {
                    const playerData = (window as any).ytInitialPlayerResponse
                    if (!playerData) return { error: "ytInitialPlayerResponse not found on page" }

                    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks
                    if (!captions?.length) return { error: "No caption tracks in ytInitialPlayerResponse" }

                    // Prefer manual CC (vssId not starting with "a.") over auto-generated
                    const track = captions.find((t: any) => t.vssId && !t.vssId.startsWith("a."))
                        || captions[0]

                    return { baseUrl: track.baseUrl, trackId: track.vssId }
                } catch (e: any) {
                    return { error: e.message }
                }
            },
            args: [videoId]
        })

        const urlResult = urlResults?.[0]?.result
        if (urlResult?.error) throw new Error(urlResult.error)
        if (!urlResult?.baseUrl) throw new Error("No baseUrl returned from page")

        console.log(`[VA-BG] Got baseUrl for track ${urlResult.trackId}, fetching from isolated world...`)

        // Step 2: Fetch the subtitle XML from ISOLATED world (content script context)
        const xmlResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: async (url: string) => {
                try {
                    const res = await fetch(url, { credentials: "include" })
                    if (!res.ok) return { error: `HTTP ${res.status}` }
                    const text = await res.text()
                    return { xml: text }
                } catch (e: any) {
                    return { error: e.message }
                }
            },
            args: [urlResult.baseUrl]
        })

        const result = { ...xmlResults?.[0]?.result, trackId: urlResult.trackId }
        console.log(`[VA-BG] Page script result: error=${result?.error ?? "none"}, xmlLen=${result?.xml?.length ?? 0}, track=${result?.trackId}`)

        if (result?.error) throw new Error(result.error)
        if (!result?.xml) throw new Error("No XML data returned from page script")

        const segments = parseSubtitleXml(result.xml)
        console.log(`[VA-BG] Parsed ${segments.length} subtitle segments`)

        if (segments.length === 0) {
            throw new Error(`Parsed 0 segments from XML (length: ${result.xml.length}), preview: ${result.xml.substring(0, 100)}`)
        }

        sendResponse({ success: true, data: segments })
    } catch (error) {
        console.error(`[VA-BG] handleYouTubeSubtitles error:`, error)
        sendResponse({ success: false, error: (error as Error).message })
    }
}

function parseSubtitleXml(xml: string): any[] {
    const segments: any[] = []
    const regex = /<(?:text|p)[^>]*\bstart="([\d.]+)"[^>]*\bdur="([\d.]+)"[^>]*>([\s\S]*?)<\/(?:text|p)>/g
    let m
    while ((m = regex.exec(xml)) !== null) {
        const text = m[3].replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
        if (text) {
            segments.push({
                start: parseFloat(m[1]),
                end: parseFloat(m[1]) + parseFloat(m[2]),
                text
            })
        }
    }
    return segments
}

// ─── Generic Fetch Handler (for Bilibili etc.) ───

async function handleFetch(message: any, sendResponse: (r: any) => void) {
    const { url, options = {} } = message
    try {
        const isBilibili = url.includes("bilibili.com") || url.includes("bilivideo.com") || url.includes("bilivideo.cn")
        const referer = isBilibili ? "https://www.bilibili.com/" : "https://www.youtube.com/"

        const fetchOptions: RequestInit = {
            credentials: "include",
            ...options,
            headers: {
                "Referer": referer,
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                ...(options.headers || {})
            }
        }
        const response = await fetch(url, fetchOptions)
        const text = await response.text()
        console.log(`[VA-BG] handleFetch ${url.substring(0, 80)} -> status=${response.status}, len=${text.length}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.substring(0, 50)}`)

        try {
            const data = JSON.parse(text)
            sendResponse({ success: true, data })
        } catch (e) {
            sendResponse({ success: true, data: text, isRaw: true })
        }
    } catch (error) {
        sendResponse({ success: false, error: (error as Error).message })
    }
}

// ─── YouTube Audio URL: page stream data + cipher decryption ───

async function handleYouTubeAudioUrl(videoId: string, tabId: number, sendResponse: (r: any) => void) {
    try {
        console.log(`[VA-BG] Getting YouTube audio URL for videoId=${videoId}`)

        // Step 1: Extract stream data + Innertube config from the live page
        const pageData = await getYouTubePageData(tabId)
        console.log(`[VA-BG] Page data: playerJsUrl=${pageData.playerJsUrl ? "found" : "missing"}, streamUrl=${pageData.streamUrl ? "direct" : "none"}, cipher=${pageData.signatureCipher ? "yes" : "no"}, innertubeCtx=${pageData.innertubeContext ? "found" : "missing"}`)

        // Step 2: Determine raw stream URL / cipher
        let rawUrl: string | null = pageData.streamUrl
        let signatureCipher: string | null = pageData.signatureCipher

        // If ytInitialPlayerResponse had no stream data, use Innertube WEB client
        // (uses YouTube's own INNERTUBE_CONTEXT — avoids 403 from client restrictions)
        if (!rawUrl && !signatureCipher) {
            if (!pageData.innertubeContext) {
                throw new Error("Could not retrieve Innertube context from page.")
            }
            console.log(`[VA-BG] ytInitialPlayerResponse had no stream — calling Innertube with WEB context...`)
            const result = await getInnertubeAudioUrl(videoId, pageData.innertubeContext, pageData.sts)

            if (result?.startsWith("__cipher__")) {
                signatureCipher = result.slice("__cipher__".length)
            } else {
                rawUrl = result
            }
        }

        if (!rawUrl && !signatureCipher) {
            throw new Error("No audio stream found. The video may be private, region-locked, or require sign-in.")
        }

        if (!pageData.playerJsUrl) {
            throw new Error("Could not locate YouTube player JS — cannot decrypt stream URL.")
        }

        // Step 3: Decrypt sig cipher + n param in one ISOLATED world call
        const finalUrl = await decryptStreamUrl(
            { rawUrl, signatureCipher, playerJsUrl: pageData.playerJsUrl },
            tabId
        )

        if (!finalUrl) throw new Error("Stream URL decryption failed.")

        console.log(`[VA-BG] Final audio URL ready`)
        sendResponse({ success: true, url: finalUrl })
    } catch (error) {
        console.error(`[VA-BG] handleYouTubeAudioUrl error:`, error)
        sendResponse({ success: false, error: (error as Error).message })
    }
}

/**
 * Read stream data, player JS URL, and Innertube context from the live YouTube page.
 * Must run in MAIN world to access page-level JS variables (ytcfg, ytInitialPlayerResponse).
 */
async function getYouTubePageData(tabId: number): Promise<{
    playerJsUrl: string | null
    streamUrl: string | null
    signatureCipher: string | null
    mimeType: string | null
    innertubeContext: any | null
    sts: number | null
}> {
    const empty = { playerJsUrl: null, streamUrl: null, signatureCipher: null, mimeType: null, innertubeContext: null, sts: null }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: () => {
                try {
                    const ytcfg = (window as any).ytcfg

                    // ── Player JS URL ──
                    let playerJsUrl: string | null = null
                    if (ytcfg?.get) {
                        const path: string = ytcfg.get("PLAYER_JS_URL") || ""
                        if (path) playerJsUrl = path.startsWith("http") ? path : `https://www.youtube.com${path}`
                    }
                    if (!playerJsUrl) {
                        const baseJs = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
                            .find(s => s.src.includes("/s/player/") && s.src.includes("base.js"))
                        playerJsUrl = baseJs?.src || null
                    }

                    // ── Innertube context (YouTube's own WEB client config) ──
                    const innertubeContext = ytcfg?.get?.("INNERTUBE_CONTEXT") || null
                    // signatureTimestamp — needed for playback context
                    const sts: number | null = ytcfg?.get?.("STS") || null

                    // ── Audio stream from ytInitialPlayerResponse (present for some videos) ──
                    const playerData = (window as any).ytInitialPlayerResponse
                    // Check both adaptiveFormats (DASH) and formats (combined), prefer adaptive
                    const allFormats: any[] = [
                        ...(playerData?.streamingData?.adaptiveFormats || []),
                        ...(playerData?.streamingData?.formats || []),
                    ]
                    const audioFormats = allFormats.filter(
                        (f: any) => f.mimeType?.includes("audio/") && !f.width
                    )
                    const preferred = audioFormats.find((f: any) => f.mimeType?.includes("audio/mp4"))
                        || audioFormats[0]

                    console.log(`[VA] ytInitialPlayerResponse audio formats found: ${audioFormats.length}`)

                    return {
                        playerJsUrl,
                        streamUrl: preferred?.url || null,
                        signatureCipher: preferred?.signatureCipher || preferred?.cipher || null,
                        mimeType: preferred?.mimeType || null,
                        innertubeContext,
                        sts,
                    }
                } catch (e: any) {
                    console.error("[VA] getYouTubePageData MAIN error:", e.message)
                    return { playerJsUrl: null, streamUrl: null, signatureCipher: null, mimeType: null, innertubeContext: null, sts: null }
                }
            }
        })
        return results?.[0]?.result ?? empty
    } catch (e) {
        console.error("[VA-BG] getYouTubePageData error:", e)
        return empty
    }
}

/**
 * Fetch stream URL via Innertube API using the page's own WEB client context.
 * This mirrors exactly what YouTube's player does, avoiding 403 from client restrictions.
 */
async function getInnertubeAudioUrl(videoId: string, innertubeContext: any, sts: number | null): Promise<string | null> {
    try {
        const body: any = {
            videoId,
            context: innertubeContext,
        }
        if (sts) {
            body.playbackContext = {
                contentPlaybackContext: { signatureTimestamp: sts }
            }
        }

        const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Origin": "https://www.youtube.com",
                "Referer": `https://www.youtube.com/watch?v=${videoId}`,
            },
            body: JSON.stringify(body)
        })

        if (!response.ok) throw new Error(`Innertube HTTP ${response.status}`)
        const data = await response.json()

        const status = data?.playabilityStatus?.status
        if (status && status !== "OK") {
            throw new Error(`Video not playable: ${data.playabilityStatus?.reason || status}`)
        }

        // Check both adaptive (audio-only) and combined formats
        const allFormats: any[] = [
            ...(data?.streamingData?.adaptiveFormats || []),
            ...(data?.streamingData?.formats || []),
        ]
        const audioFormats = allFormats.filter(
            (f: any) => f.mimeType?.includes("audio/") && !f.width && (f.url || f.signatureCipher || f.cipher)
        )
        if (!audioFormats.length) {
            console.warn("[VA-BG] Innertube: no audio formats in response")
            return null
        }

        // Prefer mp4/aac (better Whisper compat), fall back to webm/opus
        const preferred = audioFormats.find((f: any) => f.mimeType?.includes("audio/mp4"))
            || audioFormats[0]

        console.log(`[VA-BG] Innertube audio: ${preferred.mimeType}, quality=${preferred.audioQuality}, hasUrl=${!!preferred.url}, hasCipher=${!!(preferred.signatureCipher || preferred.cipher)}`)

        // If it has a direct URL, return it
        if (preferred.url) return preferred.url as string

        // If it has a cipher, we'll handle it in decryptStreamUrl — encode it back
        const cipher = preferred.signatureCipher || preferred.cipher
        if (cipher) return `__cipher__${cipher}` // sentinel for caller

        return null
    } catch (e) {
        console.error("[VA-BG] getInnertubeAudioUrl error:", e)
        return null
    }
}

/**
 * Decrypt a YouTube stream URL in a single ISOLATED world script execution.
 * Handles both signatureCipher decryption and n-parameter throttling fix.
 * Uses new Function() which is allowed in content script (ISOLATED) context.
 */
async function decryptStreamUrl(
    params: { rawUrl: string | null; signatureCipher: string | null; playerJsUrl: string },
    tabId: number
): Promise<string | null> {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "ISOLATED",
            func: async (playerUrl: string, rawUrl: string | null, cipher: string | null): Promise<string | null> => {
                // ── Helpers ──

                function findClosingBrace(js: string, openIdx: number): number {
                    let depth = 0, inStr = false, strCh = ""
                    for (let i = openIdx; i < js.length; i++) {
                        const ch = js[i]
                        if (inStr) { if (ch === "\\") { i++; continue } if (ch === strCh) inStr = false; continue }
                        if (ch === '"' || ch === "'" || ch === "`") { inStr = true; strCh = ch; continue }
                        if (ch === "{") depth++
                        if (ch === "}" && --depth === 0) return i
                    }
                    return -1
                }

                function extractFunc(js: string, name: string): { param: string; body: string } | null {
                    const pats = [
                        new RegExp(`(?:var\\s+|,\\s*)${name}\\s*=\\s*function\\(([a-zA-Z0-9$])\\)\\s*\\{`),
                        new RegExp(`${name}\\s*=\\s*function\\(([a-zA-Z0-9$])\\)\\s*\\{`),
                        new RegExp(`function\\s+${name}\\s*\\(([a-zA-Z0-9$])\\)\\s*\\{`),
                    ]
                    for (const pat of pats) {
                        const m = js.match(pat)
                        if (m?.index !== undefined) {
                            const openIdx = m.index + m[0].length - 1
                            const endIdx = findClosingBrace(js, openIdx)
                            if (endIdx !== -1) return { param: m[1], body: js.substring(openIdx + 1, endIdx) }
                        }
                    }
                    return null
                }

                // ── n-param decryption ──
                function decryptN(js: string, nParam: string): string | null {
                    const usageMatch = js.match(
                        /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]{2,3})(?:\[(\d+)\])?\([a-zA-Z0-9$]\)/
                    )
                    if (!usageMatch) { console.warn("[VA] n-transform: usage pattern not found"); return null }

                    let funcName = usageMatch[1]
                    if (usageMatch[2] !== undefined) {
                        const arrMatch = js.match(new RegExp(`var\\s+${funcName}\\s*=\\s*\\[([a-zA-Z0-9$]+)`))
                        if (arrMatch) funcName = arrMatch[1]
                    }

                    const fn = extractFunc(js, funcName)
                    if (!fn) { console.warn(`[VA] n-transform: func "${funcName}" not found`); return null }

                    try {
                        // eslint-disable-next-line no-new-func
                        const result = new Function(fn.param, fn.body)(nParam)
                        return typeof result === "string" ? result : null
                    } catch (e) { console.error("[VA] n-transform eval error:", e); return null }
                }

                // ── sig cipher decryption ──
                function decryptSig(js: string, encSig: string): string | null {
                    // Find the main decipher function (splits, does ops, joins)
                    const sigFnMatch = js.match(
                        /([a-zA-Z_$][\w$]*)=function\(\w\)\{\w=\w\.split\(""\);([\s\S]*?);return \w\.join\(""\)\}/
                    )
                    if (!sigFnMatch) { console.warn("[VA] sig-decipher: main func not found"); return null }

                    const funcName = sigFnMatch[1]
                    const funcBodyPreview = sigFnMatch[2]

                    // Find the helper object name (e.g., "AB" in AB.reverse(a))
                    const helperName = funcBodyPreview.match(/([a-zA-Z_$][\w$]*)\.[a-zA-Z_$]/)?.[1]
                    if (!helperName) { console.warn("[VA] sig-decipher: helper name not found"); return null }

                    // Extract the helper object definition (var AB={...})
                    const helperDefMatch = js.match(new RegExp(`var\\s+${helperName}\\s*=\\s*\\{`))
                    if (!helperDefMatch?.index) { console.warn("[VA] sig-decipher: helper obj not found"); return null }

                    const helperOpenIdx = helperDefMatch.index + helperDefMatch[0].length - 1
                    const helperEndIdx = findClosingBrace(js, helperOpenIdx)
                    if (helperEndIdx === -1) return null
                    const helperCode = js.substring(helperDefMatch.index, helperEndIdx + 1)

                    // Extract the decipher function itself
                    const fn = extractFunc(js, funcName)
                    if (!fn) return null

                    try {
                        // eslint-disable-next-line no-new-func
                        return new Function(`${helperCode}; return (function(${fn.param}){${fn.body}})(${JSON.stringify(encSig)})`)()
                    } catch (e) { console.error("[VA] sig-decipher eval error:", e); return null }
                }

                // ── Main logic ──
                try {
                    const resp = await fetch(playerUrl, { credentials: "include" })
                    if (!resp.ok) { console.error("[VA] Failed to fetch player JS:", resp.status); return null }
                    const js = await resp.text()

                    let baseUrl = rawUrl

                    // Handle signatureCipher → resolve to direct URL with sig appended
                    if (cipher) {
                        const p = new URLSearchParams(cipher)
                        const encSig = p.get("s") || ""
                        const sigParam = p.get("sp") || "signature"
                        baseUrl = p.get("url") || ""
                        if (!baseUrl) return null

                        const decSig = decryptSig(js, encSig)
                        if (decSig) {
                            const u = new URL(baseUrl)
                            u.searchParams.set(sigParam, decSig)
                            baseUrl = u.toString()
                        } else {
                            console.warn("[VA] sig decryption failed — URL may not play")
                        }
                    }

                    if (!baseUrl) return null

                    // Decrypt n param to avoid throttling
                    const u = new URL(baseUrl)
                    const encN = u.searchParams.get("n")
                    if (encN) {
                        const decN = decryptN(js, encN)
                        if (decN && decN !== encN) {
                            u.searchParams.set("n", decN)
                            console.log("[VA] n param decrypted")
                        } else {
                            console.warn("[VA] n param decryption failed — download may be throttled")
                        }
                    }

                    return u.toString()
                } catch (e) {
                    console.error("[VA] decryptStreamUrl isolated error:", e)
                    return null
                }
            },
            args: [params.playerJsUrl, params.rawUrl, params.signatureCipher]
        })

        return results?.[0]?.result ?? null
    } catch (e) {
        console.error("[VA-BG] decryptStreamUrl executeScript error:", e)
        return null
    }
}
