import { AIServiceFactory } from "../ai/AIServiceFactory"
import type { Comment, SampledComments } from "../platform/types"
import type { CommentAnalysis } from "../ai/types"

interface L1Payload {
    user: string
    text: string
    likes: number
    replyCount?: number
    topReplies?: { user: string; text: string; likes: number }[]
}

function toL1(c: Comment, includeReplies: boolean): L1Payload {
    const out: L1Payload = { user: c.user, text: c.text, likes: c.likes }
    if (includeReplies) {
        out.replyCount = c.replyCount ?? 0
        out.topReplies = (c.replies ?? []).map(r => ({
            user: r.user,
            text: r.text,
            likes: r.likes
        }))
    }
    return out
}

export class CommentAnalyzer {
    async analyze(sampled: SampledComments, videoOverview: string): Promise<CommentAnalysis> {
        const aiService = await AIServiceFactory.getService()
        const payload = {
            consensusPool: sampled.consensus.map(c => toL1(c, false)),
            controversialThreads: sampled.controversial.map(c => toL1(c, true))
        }
        const samplesJson = JSON.stringify(payload, null, 2)
        return await aiService.analyzeComments(videoOverview, samplesJson)
    }
}
