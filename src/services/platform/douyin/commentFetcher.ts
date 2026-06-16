import type { Comment, SampledComments } from "../types"
import {
    HOT_POOL_SIZE,
    CONSENSUS_SIZE,
    cleanComments,
    pickControversial,
} from "../commentSampling"

/**
 * Douyin has no signature-free comment API (the `/comment/list/` endpoint is
 * guarded by `a_bogus` + `x-secsdk-web-signature`), so comments are scraped
 * from the rendered DOM. The content script shares the page's light DOM, so
 * `document.querySelector` reaches the comment panel directly — no MAIN-world
 * bridge needed (unlike `window.player` for audio).
 *
 * Class names are hashed and change between Douyin deploys, so extraction keys
 * off stable anchors only: `data-e2e` containers, the `/user/` profile link for
 * the author, the SVG-preceded numeric node for the like count, and a relative
 * date pattern to delimit the comment body from the footer.
 */

const DATE_RE = /(刚刚|\d+\s*(?:分钟|小时|天|周|月|年)前|\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Parse a count like "27", "1.2万", "3w", "5k" into an integer. */
function parseCount(raw: string): number {
    const m = raw.trim().match(/^([\d.]+)\s*(万|w|k)?$/i)
    if (!m) return 0
    let n = parseFloat(m[1])
    if (Number.isNaN(n)) return 0
    const suffix = (m[2] || "").toLowerCase()
    if (suffix === "万" || suffix === "w") n *= 1e4
    if (suffix === "k") n *= 1e3
    return Math.round(n)
}

function parseItem(item: Element): Comment | null {
    // Author: first profile link that carries text (the avatar link is empty).
    let user = ""
    for (const a of item.querySelectorAll('a[href*="/user/"]')) {
        const t = (a.textContent || "").trim()
        if (t) { user = t; break }
    }

    // Likes: the numeric leaf node immediately preceded by the digg <svg> icon.
    // (SVG elements report tagName as lowercase "svg".)
    let likes = 0
    item.querySelectorAll("*").forEach((el) => {
        if (el.children.length === 0 && el.previousElementSibling?.tagName?.toLowerCase() === "svg") {
            likes = Math.max(likes, parseCount(el.textContent || ""))
        }
    })

    const innerText = (item as HTMLElement).innerText || ""

    // Reply count from the "展开N条回复" expander, when present.
    const rm = innerText.match(/展开\s*(\d+)\s*条回复/)
    const replyCount = rm ? parseInt(rm[1], 10) : 0

    // Body: lines above the date·location footer, minus the author line and
    // the truncation toggles ("...", "展开", "收起").
    const lines = innerText.split("\n").map((s) => s.trim()).filter(Boolean)
    let dateIdx = lines.findIndex((l) => DATE_RE.test(l))
    if (dateIdx < 0) dateIdx = lines.length
    let bodyLines = lines.slice(0, dateIdx)
    if (bodyLines[0] === user) bodyLines = bodyLines.slice(1)
    bodyLines = bodyLines.filter((l) => l !== "..." && l !== "展开" && l !== "收起")
    const text = bodyLines.join(" ").trim()
    if (!text) return null // image-only / empty comments carry no sentiment signal

    return { id: `${user}|${text.slice(0, 24)}`, user, text, likes, date: 0, replyCount }
}

/** Open the comment panel if collapsed; resolve once the list is in the DOM. */
async function openCommentPanel(): Promise<boolean> {
    if (document.querySelector('[data-e2e="comment-list"]')) return true
    const icon = document.querySelector('[data-e2e="feed-comment-icon"]') as HTMLElement | null
    if (!icon) return false
    icon.click()
    for (let i = 0; i < 20; i++) {
        await sleep(300)
        if (document.querySelector('[data-e2e="comment-list"]')) return true
    }
    return false
}

/**
 * Find the scrollable ancestor of the comment list that drives lazy-loading.
 * Matches on overflow style ONLY — not current scrollHeight — because a
 * freshly-opened panel may not have overflowed yet when this first runs, and
 * requiring overflow there would miss the scroller and stall the scrape at the
 * first page of comments.
 */
function findScroller(list: Element): Element | null {
    let el: Element | null = list
    while (el && el !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el
        el = el.parentElement
    }
    return null
}

// VideoContext can fire getComments twice on load (navKey settle + subtitle
// re-trigger). Two concurrent scrapes would fight over the single shared scroll
// container and each stall early (~10 comments). Single-flight by videoId so
// concurrent callers share one scrape that runs to completion.
let inFlight: { id: string; promise: Promise<SampledComments> } | null = null

export function getDouyinComments(videoId: string): Promise<SampledComments> {
    if (inFlight && inFlight.id === videoId) return inFlight.promise
    const promise = scrapeDouyinComments(videoId).finally(() => {
        if (inFlight?.promise === promise) inFlight = null
    })
    inFlight = { id: videoId, promise }
    return promise
}

async function scrapeDouyinComments(_videoId: string): Promise<SampledComments> {
    try {
        if (!(await openCommentPanel())) {
            console.warn("[DouyinComments] Comment panel did not open; returning empty.")
            return { consensus: [], controversial: [] }
        }

        const list = document.querySelector('[data-e2e="comment-list"]')
        if (!list) return { consensus: [], controversial: [] }

        // Wait for the first page of comments to actually render before scraping
        // — the panel can be present but empty for a moment after opening.
        for (let i = 0; i < 20 && document.querySelectorAll('[data-e2e="comment-item"]').length === 0; i++) {
            await sleep(300)
        }

        // Collect across scroll rounds, deduped by author+text so repeated
        // parses (or any future virtualization) don't double-count.
        const collected = new Map<string, Comment>()
        const collect = () => {
            document.querySelectorAll('[data-e2e="comment-item"]').forEach((it) => {
                const c = parseItem(it)
                if (c && !collected.has(c.id)) collected.set(c.id, c)
            })
        }
        collect()

        let stall = 0
        for (let round = 0; round < 80 && collected.size < HOT_POOL_SIZE; round++) {
            const prev = collected.size
            // Re-find each round: the scroller may not have existed (or differed)
            // when the panel first opened.
            const scroller = findScroller(list)
            if (scroller) {
                // On a stalled round, nudge up first so scrolling back to the
                // bottom re-fires the intersection-observer that drives paging —
                // Douyin sometimes pauses loading during the busy page-load window.
                if (stall > 0) scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight * 2)
                scroller.scrollTop = scroller.scrollHeight
            }
            await sleep(1200)
            collect()
            if (collected.size === prev) {
                if (++stall >= 6) break // no growth after 6 rounds → end of list
            } else {
                stall = 0
            }
        }

        // Hot pool sorted by likes; consensus = top-liked, controversial via the
        // shared reply-to-like heuristic.
        const pool = [...collected.values()].sort((a, b) => b.likes - a.likes).slice(0, HOT_POOL_SIZE)
        if (pool.length === 0) return { consensus: [], controversial: [] }

        const consensus = cleanComments(pool.slice(0, CONSENSUS_SIZE))
        const controversial = cleanComments(pickControversial(pool))
        console.log(`[DouyinComments] Scraped ${collected.size} comments → consensus=${consensus.length}, controversial=${controversial.length}`)
        return { consensus, controversial }
    } catch (error) {
        console.error("[DouyinComments] Fatal error:", error)
        return { consensus: [], controversial: [] }
    }
}
