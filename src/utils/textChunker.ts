export function chunkText(text: string, maxTokens: number = 3000): string[] {
    // Simple approximation: 1 token ~= 4 chars (English) or 1 char (Chinese)
    // To be safe, we use character count. 3000 tokens ~ 12000 chars.
    // But for mixed content, let's be conservative: 4000 chars per chunk?
    // User Requirement said "3000 tokens".
    const CHUNK_SIZE = maxTokens * 2 // approximation characters

    const chunks: string[] = []
    let currentLocation = 0

    while (currentLocation < text.length) {
        let endLocation = currentLocation + CHUNK_SIZE
        if (endLocation >= text.length) {
            chunks.push(text.slice(currentLocation))
            break
        }

        // Try to break at newline or period
        const lastNewline = text.lastIndexOf("\n", endLocation)
        const lastPeriod = text.lastIndexOf(".", endLocation)

        // If found a break point reasonably close to end (within last 10%)
        if (lastNewline > currentLocation + CHUNK_SIZE * 0.9) {
            endLocation = lastNewline + 1
        } else if (lastPeriod > currentLocation + CHUNK_SIZE * 0.9) {
            endLocation = lastPeriod + 1
        }

        chunks.push(text.slice(currentLocation, endLocation))
        currentLocation = endLocation
    }

    return chunks
}
