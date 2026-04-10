import type { SubtitleSegment } from "../types"

function dbg(msg: string) {
    console.log(`[YouTubeSubtitle] ${msg}`)
}

function parseTimestamp(ts: string): number {
    const parts = ts.split(":").map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
}

function readSegmentsFromDOM(): SubtitleSegment[] {
    const segEls = document.querySelectorAll("transcript-segment-view-model")
    const segments: SubtitleSegment[] = []
    segEls.forEach((seg, i) => {
        const timeEl = seg.querySelector(".ytwTranscriptSegmentViewModelTimestamp")
        const textEl = seg.querySelector(".yt-core-attributed-string")
        const time = timeEl?.textContent?.trim() || ""
        const text = textEl?.textContent?.trim() || ""
        if (text && time && !/^\{/.test(text)) { // skip speaker labels like {***TONY*}
            const start = parseTimestamp(time)
            segments.push({ start, end: start, text })
        }
    })
    return segments
}

async function scrollAndCollectAll(scrollEl: Element): Promise<SubtitleSegment[]> {
    const seen = new Set<string>()
    let allSegments: SubtitleSegment[] = []
    let lastCount = 0
    let stableRounds = 0

    // Scroll in increments until no new segments appear
    for (let i = 0; i < 100; i++) {
        scrollEl.scrollTop += 800
        await new Promise(r => setTimeout(r, 400))

        const current = readSegmentsFromDOM()
        current.forEach(s => {
            const key = `${s.start}|${s.text}`
            if (!seen.has(key)) {
                seen.add(key)
                allSegments.push(s)
            }
        })

        if (allSegments.length === lastCount) {
            stableRounds++
            if (stableRounds >= 3) break
        } else {
            stableRounds = 0
            lastCount = allSegments.length
        }
    }

    return allSegments.sort((a, b) => a.start - b.start)
}

export async function getYouTubeSubtitles(videoId: string): Promise<SubtitleSegment[]> {
    dbg(`START for ${videoId}`)

    try {
        // Find the "内容转文字" (transcript) button in the video actions bar
        const watchMeta = document.querySelector("ytd-watch-metadata")
        if (!watchMeta) {
            dbg("No ytd-watch-metadata found")
            return []
        }

        const transcriptBtn = Array.from(watchMeta.querySelectorAll("button[aria-label]")).find(
            b => (b as HTMLButtonElement).getAttribute("aria-label") === "内容转文字"
        ) as HTMLButtonElement | undefined

        if (!transcriptBtn) {
            dbg("Transcript button not found (video may have no subtitles, or UI label differs)")
            return []
        }

        dbg("Clicking transcript button")
        transcriptBtn.click()

        // Wait for the panel and initial segments to load
        await new Promise(r => setTimeout(r, 2500))

        const initialSegments = readSegmentsFromDOM()
        dbg(`Initial segments visible: ${initialSegments.length}`)

        if (initialSegments.length === 0) {
            dbg("No segments found after panel opened")
            return []
        }

        // Find the scrollable container inside the transcript panel
        // YouTube has two panel variants: modern (PAmodern_transcript_view) and legacy (engagement-panel-searchable-transcript)
        const panel = document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
        ) || document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
        )
        const scrollEl = panel?.querySelector("#body, .ytd-transcript-renderer, #content")
            || panel?.querySelector("div[overflow-scroll]")
            || panel

        dbg(`Scrolling panel (target=${panel?.getAttribute("target-id")}) to collect all segments...`)
        let allSegments = await scrollAndCollectAll(scrollEl!)

        if (allSegments.length === 0) {
            // Fallback: use initial segments
            allSegments = initialSegments
        }

        dbg(`Total segments collected: ${allSegments.length}`)

        // Close the transcript panel
        const closeBtn = panel?.querySelector(
            "button[aria-label='关闭'], button[aria-label='Close'], button[aria-label='关闭转写文稿'], button[aria-label='Close transcript']"
        ) as HTMLButtonElement | null
        if (closeBtn) {
            closeBtn.click()
            dbg("Transcript panel closed")
        } else {
            dbg("Close button not found, panel may remain open")
        }

        // Fill in end times from next segment's start
        for (let i = 0; i < allSegments.length - 1; i++) {
            allSegments[i].end = allSegments[i + 1].start
        }
        if (allSegments.length > 0) {
            const last = allSegments[allSegments.length - 1]
            last.end = last.start + 5
        }

        return allSegments
    } catch (e) {
        dbg(`Exception: ${(e as Error).message}`)
        return []
    }
}
