import type { SubtitleSegment } from "../types"

/**
 * Fetch YouTube subtitles via XHR interception.
 *
 * Strategy:
 * 1. Check if data was already captured (fast path via __vaTimedText).
 * 2. Inject XHR interceptor + toggle subtitles, then poll __vaTimedText every 2s.
 *    Re-toggle subtitles every 5s in case the player wasn't ready on first attempt.
 * 3. Listen for timedtext XHR result via window.postMessage.
 * 4. Parse the json3 format into SubtitleSegment[].
 */

let pendingResolve: ((segments: SubtitleSegment[]) => void) | null = null
let pendingVideoId: string | null = null

// Listen for timedtext results posted from MAIN world
window.addEventListener("message", (event) => {
    if (event.data?.type !== "VA_TIMEDTEXT_RESULT") return
    if (!pendingResolve || event.data.videoId !== pendingVideoId) return

    const json3: string = event.data.body
    const segments = parseJson3(json3)
    console.log(`[YouTubeSubtitle] Received ${segments.length} segments via postMessage`)
    pendingResolve(segments)
    pendingResolve = null
    pendingVideoId = null
})

export async function getYouTubeSubtitles(videoId: string): Promise<SubtitleSegment[]> {
    console.log(`[YouTubeSubtitle] Requesting subtitles for ${videoId}`)
    const t0 = Date.now()

    // Wait for the YouTube player to be ready
    await waitForPlayer()

    // Fast path: check if data was already captured
    const existing = await readFromMainWorld(videoId)
    if (existing && existing.length > 0) {
        console.log(`[YouTubeSubtitle] Found existing capture: ${existing.length} segments (${Date.now() - t0}ms)`)
        return existing
    }

    // Fast negative path: ask the player whether any caption tracks exist. If
    // none, return immediately instead of waiting out the 20s toggle/intercept
    // timeout below (this is the common case for videos without CC).
    const ccPresent = await hasCaptions()
    if (!ccPresent) {
        console.log(`[YouTubeSubtitle] No caption tracks — no CC, skipping intercept (${Date.now() - t0}ms)`)
        return []
    }

    // Install XHR interceptor + toggle subtitles, then poll + re-toggle.
    // Return as soon as we get data from any source.
    const result = await new Promise<SubtitleSegment[] | null>((resolve) => {
        let done = false
        let pollTimer: ReturnType<typeof setInterval>
        let toggleTimer: ReturnType<typeof setInterval>
        let timeoutTimer: ReturnType<typeof setTimeout>

        const cleanup = () => {
            clearInterval(pollTimer)
            clearInterval(toggleTimer)
            clearTimeout(timeoutTimer)
            pendingResolve = null
            pendingVideoId = null
        }

        // --- Arm A: XHR interception via postMessage ---
        pendingResolve = (segments) => {
            if (done) return
            done = true
            cleanup()
            console.log(`[YouTubeSubtitle] XHR intercept: ${segments.length} segments (${Date.now() - t0}ms)`)
            resolve(segments)
        }
        pendingVideoId = videoId

        // Initial toggle
        sendToggle(videoId)

        // --- Arm B: poll __vaTimedText every 2s ---
        pollTimer = setInterval(async () => {
            if (done) return
            const polled = await readFromMainWorld(videoId)
            if (polled && polled.length > 0) {
                done = true
                cleanup()
                console.log(`[YouTubeSubtitle] Poll: ${polled.length} segments (${Date.now() - t0}ms)`)
                resolve(polled)
            }
        }, 2000)

        // --- Arm C: re-toggle every 5s (player may not have been ready initially) ---
        toggleTimer = setInterval(() => {
            if (done) return
            console.log(`[YouTubeSubtitle] Re-toggling subtitles... (${Date.now() - t0}ms)`)
            sendToggle(videoId)
        }, 5000)

        // Overall timeout: 20s
        timeoutTimer = setTimeout(() => {
            if (!done) {
                done = true
                cleanup()
                console.warn(`[YouTubeSubtitle] Timed out after ${Date.now() - t0}ms — no subtitles found`)
                resolve(null)
            }
        }, 20000)
    })

    if (result && result.length > 0) return result

    console.warn("[YouTubeSubtitle] All attempts exhausted — no subtitles found")
    return []
}

/** Send FETCH_YOUTUBE_SUBTITLES message to background to toggle subtitles. */
function sendToggle(videoId: string) {
    try {
        chrome.runtime.sendMessage(
            { type: "FETCH_YOUTUBE_SUBTITLES", videoId },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[YouTubeSubtitle] Toggle error:", chrome.runtime.lastError.message)
                }
            }
        )
    } catch (e) {
        // sendMessage throws synchronously when the extension context is invalid
        console.warn("[YouTubeSubtitle] Toggle threw (context invalidated?):", (e as Error).message)
    }
}

/**
 * Ask background (MAIN world) whether the player reports any caption tracks.
 * On any uncertainty (no response / context invalidated / error) we assume CC
 * MAY exist and return true, so the caller falls through to the normal
 * toggle+intercept path — i.e. this only ever short-circuits on a confident
 * "no captions", never causes a false negative that drops real subtitles.
 */
async function hasCaptions(): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false
        const finish = (val: boolean) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(val)
        }
        // Safety net mirroring readFromMainWorld: if the callback never fires
        // (extension context invalidated), don't hang — assume CC and proceed.
        const timer = setTimeout(() => finish(true), 6000)

        try {
            chrome.runtime.sendMessage(
                { type: "CHECK_YOUTUBE_CAPTIONS_TRACKLIST" },
                (response) => {
                    if (chrome.runtime.lastError || !response?.success) {
                        finish(true)
                        return
                    }
                    finish(!!response.hasCC)
                }
            )
        } catch (e) {
            finish(true)
        }
    })
}

/** Ask background to read __vaTimedText from MAIN world and parse it. */
async function readFromMainWorld(videoId: string): Promise<SubtitleSegment[] | null> {
    return new Promise((resolve) => {
        let settled = false
        const finish = (val: SubtitleSegment[] | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(val)
        }

        // Safety net: if the extension context was invalidated (e.g. the
        // extension reloaded/updated while this page stayed open), the
        // sendMessage callback may never fire, leaving this await hung
        // forever and freezing subtitle detection on "detecting...". Time
        // out and resolve null so the caller proceeds to the polled main
        // loop (which has its own 20s overall timeout).
        const timer = setTimeout(() => finish(null), 3000)

        try {
            chrome.runtime.sendMessage(
                { type: "CHECK_YOUTUBE_SUBTITLES_CACHE", videoId },
                (response) => {
                    if (chrome.runtime.lastError || !response?.success || !response.data?.length) {
                        finish(null)
                        return
                    }
                    finish(response.data)
                }
            )
        } catch (e) {
            finish(null)
        }
    })
}

/** Wait up to 10s for the YouTube player element to mount. */
function waitForPlayer(): Promise<void> {
    return new Promise((resolve) => {
        if (document.getElementById("movie_player")) return resolve()
        const t0 = Date.now()
        const timer = setInterval(() => {
            if (document.getElementById("movie_player") || Date.now() - t0 > 10000) {
                clearInterval(timer)
                resolve()
            }
        }, 300)
    })
}

/** Parse YouTube json3 timedtext format into SubtitleSegment[]. */
function parseJson3(raw: string): SubtitleSegment[] {
    const data = JSON.parse(raw)
    const events: any[] = data.events || []
    const segments: SubtitleSegment[] = []

    for (const ev of events) {
        if (!ev.segs || ev.segs.length === 0) continue
        const text = ev.segs.map((s: any) => s.utf8 ?? "").join("").trim()
        if (!text) continue
        const start = Math.round((ev.tStartMs || 0) / 10) / 100
        const end = Math.round(((ev.tStartMs || 0) + (ev.dDurationMs || 0)) / 10) / 100
        segments.push({ start, end, text })
    }

    return segments
}