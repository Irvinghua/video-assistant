import type { Comment } from "./types"

export const HOT_POOL_SIZE = 100
export const CONSENSUS_SIZE = 50
export const CONTROVERSY_SIZE = 50
export const L2_PER_THREAD = 5
export const MIN_COMMENT_LENGTH = 5
export const REPLY_COUNT_THRESHOLD = 10
export const CONTROVERSY_INDEX_THRESHOLD = 0.1
export const L2_CONCURRENCY = 3

const MENTION_RE = /@[\w\u4e00-\u9fa5-]+/g
const URL_RE = /https?:\/\/\S+/gi
const BRACKETED_TS_RE = /\[\s*\d{1,2}:\d{1,2}(?::\d{2})?\s*\]/g
const BARE_TS_RE = /\b\d{1,2}:\d{1,2}(?::\d{2})?\b/g
const EMOJI_RE =
    /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu

function cleanText(t: string): string {
    return t
        .replace(MENTION_RE, "")
        .replace(URL_RE, "")
        .replace(BRACKETED_TS_RE, "")
        .replace(BARE_TS_RE, "")
        .replace(EMOJI_RE, "")
        .replace(/\s+/g, " ")
        .trim()
}

export function cleanComments(list: Comment[]): Comment[] {
    const out: Comment[] = []
    for (const c of list) {
        const text = cleanText(c.text)
        if (text.length < MIN_COMMENT_LENGTH) continue
        out.push({ ...c, text })
    }
    return out
}

export function pickControversial(pool: Comment[]): Comment[] {
    return pool
        .filter(c => (c.replyCount ?? 0) > REPLY_COUNT_THRESHOLD)
        .map(c => ({ c, idx: (c.replyCount ?? 0) / (c.likes + 1) }))
        .filter(({ idx }) => idx > CONTROVERSY_INDEX_THRESHOLD)
        .sort((a, b) => b.idx - a.idx)
        .slice(0, CONTROVERSY_SIZE)
        .map(({ c }) => c)
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const workerCount = Math.min(limit, items.length)
    const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
            const i = cursor++
            if (i >= items.length) break
            results[i] = await fn(items[i], i)
        }
    })
    await Promise.all(workers)
    return results
}
