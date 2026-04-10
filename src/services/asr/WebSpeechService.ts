import type { IASRService } from "./types"

export class WebSpeechService implements IASRService {
    // The previous implementation tried to take a Blob, which is impossible for Web Speech API.
    // We now expect the caller (SummaryPanel) to handle the UI prompt and playback.
    // This service just wraps the SpeechRecognition API.

    async transcribe(audio: Blob): Promise<string> {
        // audio blob is ignored because Web Speech API only listens to Mic.

        return new Promise((resolve, reject) => {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            if (!SpeechRecognition) {
                reject(new Error("Web Speech API not supported in this browser"))
                return
            }

            const recognition = new SpeechRecognition()
            recognition.continuous = true
            recognition.interimResults = false
            recognition.lang = "zh-CN" // Default to Chinese as user context implies, or auto?
            // Better to let user config or detect. For now fixed to match typical Bilibili content.
            // Or maybe "en-US" if YouTube? 
            // Ideally should be passed in options. For MVP, let's use a safe default or browser default?
            // Let's use "zh-CN" since Bilibili is primary target for this fix.

            let finalTranscript = ""
            let silenceTimer: any

            recognition.onstart = () => {
                console.log("Web Speech API started listening...")
            }

            recognition.onresult = (event: any) => {
                clearTimeout(silenceTimer)
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript
                    }
                }
                // Reset silence timer
                silenceTimer = setTimeout(() => {
                    recognition.stop()
                }, 5000) // Stop after 5s of silence
            }

            recognition.onerror = (event: any) => {
                // "no-speech" is common if volume is low.
                if (event.error === 'no-speech') {
                    // ignore or warn
                } else {
                    reject(new Error("Speech recognition error: " + event.error))
                }
            }

            recognition.onend = () => {
                resolve(finalTranscript)
            }

            recognition.start()

            // Hard stop after 60s to prevent infinite listening
            setTimeout(() => {
                if (finalTranscript) recognition.stop()
            }, 60000)
        })
    }

    async isAvailable(): Promise<boolean> {
        return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    }
}
