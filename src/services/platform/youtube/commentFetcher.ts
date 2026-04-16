import type { Comment, SampledComments } from "../types"
import {
    HOT_POOL_SIZE,
    CONSENSUS_SIZE,
    L2_PER_THREAD,
    L2_CONCURRENCY,
    cleanComments,
    pickControversial,
    mapWithConcurrency
} from "../commentSampling"

const INNERTUBE_ENDPOINT = "https://www.youtube.com/youtubei/v1/next"
const FALLBACK_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
const FALLBACK_CLIENT_VERSION = "2.20241201.00.00"

interface WatchConfig {
    apiKey: string
    context: { client: { clientName: string; clientVersion: string; hl: string; gl: string } }
    initialContinuation: string | null
}

function parseCount(text: string | number | undefined | null): number {
    if (text == null) return 0
    if (typeof text === "number") return text
    const t = String(text).trim()
    const m = t.match(/([\d.,]+)\s*([KMB万亿]?)/i)
    if (!m) return 0
    const n = parseFloat(m[1].replace(/,/g, ""))
    if (isNaN(n)) return 0
    const suffix = m[2].toUpperCase()
    const mult = { K: 1e3, M: 1e6, B: 1e9, "万": 1e4, "亿": 1e8, "": 1 }[suffix] ?? 1
    return Math.round(n * mult)
}

function runsToText(node: any): string {
    if (!node) return ""
    if (typeof node === "string") return node
    if (node.simpleText) return node.simpleText
    if (Array.isArray(node.runs)) return node.runs.map((r: any) => r.text ?? "").join("")
    if (typeof node.content === "string") return node.content
    return ""
}

async function fetchWatchConfig(videoId: string): Promise<WatchConfig> {
    const res = await fetch(`/watch?v=${videoId}`, { credentials: "include" })
    const html = await res.text()

    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || FALLBACK_API_KEY
    const clientVersion = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1]
        || html.match(/"clientVersion":"(2\.\d+\.\d+\.\d+)"/)?.[1]
        || FALLBACK_CLIENT_VERSION

    const context = {
        client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" }
    }

    let initialContinuation: string | null = null
    const dataMatch = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)
    if (dataMatch) {
        try {
            initialContinuation = findCommentsContinuation(JSON.parse(dataMatch[1]))
        } catch (e) {
            console.warn("[YouTubeComments] ytInitialData parse failed:", (e as Error).message)
        }
    }
    return { apiKey, context, initialContinuation }
}

function findCommentsContinuation(data: any): string | null {
    const items = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents ?? []
    for (const item of items) {
        const section = item.itemSectionRenderer
        if (!section) continue
        if (section.sectionIdentifier && !String(section.sectionIdentifier).includes("comment")) continue
        for (const c of section.contents ?? []) {
            const token = c.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
            if (token) return token
        }
    }
    return null
}

async function innertubeNext(apiKey: string, context: any, continuation: string): Promise<any> {
    const res = await fetch(`${INNERTUBE_ENDPOINT}?key=${apiKey}&prettyPrint=false`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, continuation })
    })
    if (!res.ok) throw new Error(`InnerTube ${res.status}`)
    return await res.json()
}

function collectEntityPayloads(data: any): Map<string, any> {
    const map = new Map<string, any>()
    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations ?? []
    for (const m of mutations) {
        const p = m.payload?.commentEntityPayload
        const id = p?.properties?.commentId
        if (id) map.set(id, p)
    }
    return map
}

function parseOldComment(cr: any): Comment | null {
    if (!cr?.commentId) return null
    return {
        id: cr.commentId,
        user: runsToText(cr.authorText),
        text: runsToText(cr.contentText),
        likes: parseCount(cr.voteCount?.simpleText ?? runsToText(cr.voteCount)),
        date: 0,
        replyCount: parseCount(cr.replyCount)
    }
}

function parseEntityComment(entity: any): Comment | null {
    if (!entity?.properties?.commentId) return null
    return {
        id: entity.properties.commentId,
        user: entity.author?.displayName ?? "",
        text: entity.properties.content?.content ?? "",
        likes: parseCount(entity.toolbar?.likeCountNotliked ?? entity.toolbar?.likeCountLiked),
        date: 0,
        replyCount: parseCount(entity.toolbar?.replyCount)
    }
}

function extractReplyContinuation(threadRenderer: any): string | null {
    const contents = threadRenderer?.replies?.commentRepliesRenderer?.contents
        ?? threadRenderer?.commentViewModel?.commentViewModel?.replies?.commentRepliesViewModel?.contents
    if (!Array.isArray(contents)) return null
    for (const c of contents) {
        const token = c.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
        if (token) return token
    }
    return null
}

interface ThreadParse {
    comment: Comment
    replyContinuation: string | null
}

function parseThread(threadRenderer: any, entities: Map<string, any>): ThreadParse | null {
    let comment: Comment | null = parseOldComment(threadRenderer.comment?.commentRenderer)
    if (!comment) {
        const vm = threadRenderer.commentViewModel?.commentViewModel
        const id = vm?.commentId || vm?.commentKey
        if (id) {
            const entity = entities.get(id)
            if (entity) comment = parseEntityComment(entity)
        }
    }
    if (!comment) return null
    return { comment, replyContinuation: extractReplyContinuation(threadRenderer) }
}

interface PageExtract {
    threads: any[]
    looseReplies: any[]
    nextContinuation: string | null
}

function extractPage(response: any): PageExtract {
    const endpoints = response.onResponseReceivedEndpoints ?? []
    const threads: any[] = []
    const looseReplies: any[] = []
    let nextContinuation: string | null = null
    for (const ep of endpoints) {
        const cmd = ep.reloadContinuationItemsCommand ?? ep.appendContinuationItemsCommand ?? ep.appendContinuationItemsAction
        for (const it of cmd?.continuationItems ?? []) {
            if (it.commentThreadRenderer) threads.push(it.commentThreadRenderer)
            else if (it.commentRenderer || it.commentViewModel) looseReplies.push(it)
            else if (it.continuationItemRenderer) {
                const token = it.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token
                if (token) nextContinuation = token
            }
        }
    }
    return { threads, looseReplies, nextContinuation }
}

async function fetchTopThreads(videoId: string, target: number): Promise<{ comments: Comment[]; replyContinuations: Map<string, string>; apiKey: string; context: any }> {
    const { apiKey, context, initialContinuation } = await fetchWatchConfig(videoId)
    const replyContinuations = new Map<string, string>()
    const comments: Comment[] = []
    if (!initialContinuation) {
        console.warn("[YouTubeComments] No comments continuation; comments likely disabled.")
        return { comments, replyContinuations, apiKey, context }
    }

    let continuation: string | null = initialContinuation
    let emptyRounds = 0
    while (continuation && comments.length < target) {
        const response = await innertubeNext(apiKey, context, continuation)
        const entities = collectEntityPayloads(response)
        const { threads, nextContinuation } = extractPage(response)
        if (threads.length === 0) {
            if (++emptyRounds >= 2) break
        } else {
            emptyRounds = 0
        }
        for (const t of threads) {
            const parsed = parseThread(t, entities)
            if (!parsed) continue
            comments.push(parsed.comment)
            if (parsed.replyContinuation) replyContinuations.set(parsed.comment.id, parsed.replyContinuation)
            if (comments.length >= target) break
        }
        continuation = nextContinuation
    }
    return { comments: comments.slice(0, target), replyContinuations, apiKey, context }
}

async function fetchTopReplies(replyContinuation: string, apiKey: string, context: any, limit: number): Promise<Comment[]> {
    const response = await innertubeNext(apiKey, context, replyContinuation)
    const entities = collectEntityPayloads(response)
    const { looseReplies } = extractPage(response)
    const replies: Comment[] = []
    for (const it of looseReplies) {
        let c = parseOldComment(it.commentRenderer)
        if (!c) {
            const vm = it.commentViewModel?.commentViewModel
            const id = vm?.commentId || vm?.commentKey
            const entity = id ? entities.get(id) : null
            if (entity) c = parseEntityComment(entity)
        }
        if (c) replies.push(c)
    }
    return replies.sort((a, b) => b.likes - a.likes).slice(0, limit)
}

export async function getYouTubeComments(videoId: string): Promise<SampledComments> {
    try {
        const { comments: l1, replyContinuations, apiKey, context } = await fetchTopThreads(videoId, HOT_POOL_SIZE)
        if (l1.length === 0) return { consensus: [], controversial: [] }

        const consensus = cleanComments(l1.slice(0, CONSENSUS_SIZE))
        const controversialRaw = cleanComments(pickControversial(l1))

        const controversial = await mapWithConcurrency(controversialRaw, L2_CONCURRENCY, async c => {
            const rc = replyContinuations.get(c.id)
            if (!rc) return c
            try {
                const replies = cleanComments(await fetchTopReplies(rc, apiKey, context, L2_PER_THREAD))
                return { ...c, replies }
            } catch (e) {
                console.warn(`[YouTubeComments] L2 fetch failed for ${c.id}:`, (e as Error).message)
                return c
            }
        })

        return { consensus, controversial }
    } catch (error) {
        console.error("[YouTubeComments] Fatal error:", error)
        return { consensus: [], controversial: [] }
    }
}
