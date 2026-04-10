export { }

console.log("[VA] Background Service Worker Loaded")

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FETCH_API") {
        handleFetch(message, sendResponse);
        return true;
    }

    if (message.type === "FETCH_YOUTUBE_SUBTITLES") {
        const tabId = sender.tab?.id
        if (!tabId) {
            sendResponse({ success: false, error: "No tab ID available" })
            return true
        }
        handleYouTubeSubtitles(message.videoId, tabId, sendResponse);
        return true;
    }

    if (message.type === "FETCH_AUDIO") {
        handleFetchAudio(message.url, message.referer, sendResponse);
        return true;
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
        // - NOT intercepted by YouTube's page Service Worker (unlike MAIN world fetch)
        // - credentials:"include" attaches the user's YouTube cookies (unlike background SW)
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

        if (result?.error) {
            throw new Error(result.error)
        }

        if (!result?.xml) {
            throw new Error("No XML data returned from page script")
        }

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
        const isBilibili = url.includes("bilibili.com") || url.includes("bilivideo.com") || url.includes("bilivideo.cn");
        const referer = isBilibili ? "https://www.bilibili.com/" : "https://www.youtube.com/";

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
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.substring(0, 50)}`);

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

// ─── Audio Fetch Handler ───

async function handleFetchAudio(url: string, referer: string, sendResponse: (r: any) => void) {
    try {
        console.log(`[VA-BG] Fetching audio from: ${url.substring(0, 100)}...`)

        const isBilibili = url.includes("bilibili.com") || url.includes("akamaized.net") || url.includes("bilivideo.com") || url.includes("bilivideo.cn") || url.includes("mcdn.bilivideo.com");
        const origin = isBilibili ? "https://www.bilibili.com" : "https://www.youtube.com";

        const response = await fetch(url, {
            credentials: "include",
            headers: {
                "Referer": referer || (isBilibili ? "https://www.bilibili.com/" : "https://www.youtube.com/"),
                "Origin": origin,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Range": "bytes=0-",
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} when fetching audio`);

        const arrayBuffer = await response.arrayBuffer();
        const base64 = btoa(
            new Uint8Array(arrayBuffer)
                .reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        sendResponse({ success: true, data: base64 });
    } catch (error) {
        console.error("[VA-BG] handleFetchAudio error:", error);
        sendResponse({ success: false, error: (error as Error).message });
    }
}
