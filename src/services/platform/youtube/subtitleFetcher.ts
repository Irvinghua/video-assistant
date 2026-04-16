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

const SEGMENT_VARIANTS: { el: string; time: string; text: string[] }[] = [
    { el: "ytd-transcript-segment-renderer", time: ".segment-timestamp", text: [".segment-text"] },
    { el: "transcript-segment-view-model", time: ".ytwTranscriptSegmentViewModelTimestamp", text: [".ytAttributedStringHost", "span[role='text']", ".yt-core-attributed-string"] }
]

function readSegmentsFromDOM(): SubtitleSegment[] {
    for (const v of SEGMENT_VARIANTS) {
        const segEls = document.querySelectorAll(v.el)
        if (segEls.length === 0) continue
        const segments: SubtitleSegment[] = []
        segEls.forEach(seg => {
            const time = seg.querySelector(v.time)?.textContent?.trim() || ""
            let text = ""
            for (const sel of v.text) {
                text = seg.querySelector(sel)?.textContent?.trim().replace(/\s+/g, " ") || ""
                if (text) break
            }
            if (text && time && !/^\{/.test(text)) {
                const start = parseTimestamp(time)
                segments.push({ start, end: start, text })
            }
        })
        if (segments.length > 0) return segments
    }
    return []
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

function findTranscriptButton(): HTMLButtonElement | null {
    const section = document.querySelector("ytd-video-description-transcript-section-renderer")
    return (section?.querySelector("button") as HTMLButtonElement | null) ?? null
}

async function expandDescription(watchMeta: Element): Promise<void> {
    const expandBtn = watchMeta.querySelector("tp-yt-paper-button#expand, #expand") as HTMLElement | null
    if (expandBtn) {
        expandBtn.click()
        await new Promise(r => setTimeout(r, 400))
    }
}

export async function getYouTubeSubtitles(videoId: string): Promise<SubtitleSegment[]> {
    dbg(`START for ${videoId}`)

    try {
        const watchMeta = document.querySelector("ytd-watch-metadata")
        if (!watchMeta) {
            dbg("No ytd-watch-metadata found")
            return []
        }

        let transcriptBtn = findTranscriptButton()
        if (!transcriptBtn) {
            dbg("Transcript section not in DOM; expanding description...")
            await expandDescription(watchMeta)
            transcriptBtn = findTranscriptButton()
        }

        if (!transcriptBtn) {
            dbg("Transcript section still absent (video has no subtitles)")
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

        // Close the transcript panel using structural DOM selector (language-agnostic)
        const closeBtn = panel?.querySelector(
            "#header #navigation-button button, ytd-engagement-panel-title-header-renderer #navigation-button button"
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
