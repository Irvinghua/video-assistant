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

export type ConsensusHeat = "extreme" | "high" | "medium"

export interface CommentAnalysis {
    consensus: { point: string; heat: ConsensusHeat }[]
    divergences: {
        topic: string
        sideA: string
        sideB: string
        rootCause: string
    }[]
    gap: {
        hit: string
        miss: string
    }
    mood: string[]
    spotlight: string[]
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
    analyzeComments(videoOverview: string, samplesJson: string): Promise<CommentAnalysis>

    /**
     * Chat with context
     */
    chat(messages: ChatMessage[], context?: string): Promise<string>

    /**
     * Get the provider name
     */
    getModelName(): string
}
