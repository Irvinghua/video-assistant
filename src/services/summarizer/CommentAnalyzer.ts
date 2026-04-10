import { AIServiceFactory } from "../ai/AIServiceFactory"
import type { Comment } from "../platform/types"
import type { CommentAnalysis } from "../ai/types"

export class CommentAnalyzer {
    async analyze(comments: Comment[]): Promise<CommentAnalysis> {
        const aiService = await AIServiceFactory.getService()

        // Prepare comments text (top 500 max)
        const commentsText = comments.map(c => `[${c.likes} likes] ${c.user}: ${c.text}`).join("\n")

        const result = await aiService.analyzeComments([commentsText])
        return result
    }
}
