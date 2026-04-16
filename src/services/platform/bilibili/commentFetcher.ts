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

interface BiliComment {
    rpid: number
    oid: number
    member: { uname: string; avatar: string }
    content: { message: string }
    like: number
    ctime: number
    rcount: number
}

async function bgFetch(url: string): Promise<any> {
    const res = await fetch(url, {
        credentials: "include",
        headers: {
            "Referer": "https://www.bilibili.com",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    })
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    return res.json()
}

async function getAid(bvid: string): Promise<string> {
    const data = await bgFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
    return data.data?.aid?.toString() || ""
}

function toComment(r: BiliComment): Comment {
    return {
        id: r.rpid.toString(),
        user: r.member.uname,
        text: r.content.message,
        likes: r.like,
        date: r.ctime * 1000,
        replyCount: r.rcount
    }
}

async function fetchTopHotL1(aid: string, target: number): Promise<Comment[]> {
    const pageSize = 20
    const out: Comment[] = []
    let page = 1
    while (out.length < target) {
        const url = `https://api.bilibili.com/x/v2/reply/main?oid=${aid}&type=1&mode=3&ps=${pageSize}&next=${page}`
        const data = await bgFetch(url)
        if (data.code !== 0) {
            console.warn("[BilibiliComments] L1 API error:", data.message)
            break
        }
        const replies: BiliComment[] = data.data?.replies || []
        if (replies.length === 0) break
        out.push(...replies.map(toComment))
        page++
        if (out.length < target) {
            await new Promise(r => setTimeout(r, Math.random() * 500 + 300))
        }
    }
    return out.slice(0, target)
}

async function fetchTopReplies(aid: string, rootRpid: string, limit: number): Promise<Comment[]> {
    const url = `https://api.bilibili.com/x/v2/reply/reply?oid=${aid}&type=1&root=${rootRpid}&ps=${limit}&pn=1`
    const data = await bgFetch(url)
    if (data.code !== 0) throw new Error(data.message || `reply/reply code=${data.code}`)
    const replies: BiliComment[] = data.data?.replies || []
    return [...replies]
        .sort((a, b) => (b.like || 0) - (a.like || 0))
        .slice(0, limit)
        .map(toComment)
}

export async function getBilibiliComments(bvid: string): Promise<SampledComments> {
    try {
        const aid = await getAid(bvid)
        if (!aid) return { consensus: [], controversial: [] }

        const l1 = await fetchTopHotL1(aid, HOT_POOL_SIZE)
        if (l1.length === 0) return { consensus: [], controversial: [] }

        const consensus = cleanComments(l1.slice(0, CONSENSUS_SIZE))
        const controversialRaw = cleanComments(pickControversial(l1))

        const controversial = await mapWithConcurrency(controversialRaw, L2_CONCURRENCY, async c => {
            try {
                const replies = cleanComments(await fetchTopReplies(aid, c.id, L2_PER_THREAD))
                return { ...c, replies }
            } catch (e) {
                console.warn(`[BilibiliComments] L2 fetch failed for rpid=${c.id}:`, (e as Error).message)
                return c
            }
        })

        return { consensus, controversial }
    } catch (error) {
        console.error("[BilibiliComments] Fatal error:", error)
        return { consensus: [], controversial: [] }
    }
}
