import type { Comment } from "../types"

interface BiliComment {
    rpid: number
    oid: number
    member: {
        uname: string
        avatar: string
    }
    content: {
        message: string
    }
    like: number
    ctime: number
    rcount: number
}

/**
 * Helper: fetch directly from content script context so browser cookies
 * (Bilibili login) are included. Content scripts with host_permissions bypass CORS.
 */
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

// Helper to get aid from bvid
async function getAid(bvid: string): Promise<string> {
    const data = await bgFetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
    return data.data?.aid?.toString() || ""
}

export async function getBilibiliComments(bvid: string, limit: number = 100): Promise<Comment[]> {
    try {
        const aid = await getAid(bvid)
        if (!aid) return []

        const comments: Comment[] = []
        let page = 1
        const pageSize = 20

        while (comments.length < limit) {
            const url = `https://api.bilibili.com/x/v2/reply/main?oid=${aid}&type=1&mode=3&ps=${pageSize}&next=${page}`

            const data = await bgFetch(url)

            if (data.code !== 0) {
                console.warn("Bilibili comment API error:", data.message)
                break
            }

            const replies: BiliComment[] = data.data?.replies || []
            if (replies.length === 0) break

            const mapped = replies.map(r => ({
                id: r.rpid.toString(),
                user: r.member.uname,
                text: r.content.message,
                likes: r.like,
                date: r.ctime * 1000,
                replies: r.rcount
            }))

            comments.push(...mapped)
            page++

            // Random delay to avoid rate limiting
            if (comments.length < limit) {
                await new Promise(r => setTimeout(r, Math.random() * 500 + 300))
            }
        }

        return comments.slice(0, limit)

    } catch (error) {
        console.error("Error fetching Bilibili comments:", error)
        return []
    }
}
