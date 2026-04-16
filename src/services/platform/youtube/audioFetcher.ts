/**
 * YouTube audio URL fetcher.
 * Sends a message to the Background Worker which handles:
 *  1. Innertube API call (Android client) to get a direct stream URL (no signatureCipher)
 *  2. n-parameter decryption via the player JS cipher function
 */
export async function getYouTubeAudioUrl(videoId: string): Promise<string | null> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "FETCH_YOUTUBE_AUDIO_URL", videoId },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[audioFetcher]", chrome.runtime.lastError.message)
                    resolve(null)
                    return
                }
                if (response?.success) {
                    resolve(response.url)
                } else {
                    console.error("[audioFetcher] Failed to get audio URL:", response?.error)
                    resolve(null)
                }
            }
        )
    })
}
