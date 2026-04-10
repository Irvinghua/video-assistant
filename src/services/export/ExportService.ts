import type { SummaryResult } from "../ai/types"

export class ExportService {
    static toMarkdown(summary: SummaryResult, videoTitle: string, videoUrl: string): string {
        const lines = [
            `# ${videoTitle}`,
            `Source: ${videoUrl}`,
            `\n## One Liner`,
            summary.oneLiner,
            `\n## Key Points`,
        ]

        summary.chapters.forEach(chap => {
            lines.push(`- **${formatTime(chap.timestamp)}** ${chap.title}`)
            lines.push(`  - ${chap.summary}`)
        })

        lines.push(`\n## Full Digest`)
        lines.push(summary.fullDigest)

        return lines.join("\n")
    }

    static download(content: string, filename: string) {
        const blob = new Blob([content], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}
