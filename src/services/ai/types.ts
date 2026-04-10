export interface ChatMessage {
    role: "user" | "assistant" | "system"
    content: string
}

export interface SummaryResult {
    oneLiner: string
    chapters: {
        timestamp: number
        title: string
        summary: string
    }[]
    fullDigest: string
}

export interface CommentAnalysis {
    clusters: {
        label: string
        ratio: number
        examples: string[]
    }[]
    sentiment: {
        positive: number
        negative: number
        neutral: number
    }
    controversies: {
        topic: string
        agreed: string
        disagreed: string
    }[]
}

export interface SummarizeOptions {
    language?: string
    maxLength?: number
}

export interface IAIService {
    /**
     * Summarize text content
     */
    summarize(text: string, opts?: SummarizeOptions): Promise<SummaryResult>

    /**
     * Analyze comments for clustering and sentiment
     */
    analyzeComments(comments: string[], opts?: any): Promise<CommentAnalysis>

    /**
     * Chat with context
     */
    chat(messages: ChatMessage[], context?: string): Promise<string>

    /**
     * Get the provider name
     */
    getModelName(): string
}
