import { useStorage } from "@plasmohq/storage/hook"

export interface ApiKeyStatus {
    hasChatKey: boolean
    hasAsrKey: boolean
    chatProvider: string
    asrProvider: string
}

export function useApiKeyStatus(): ApiKeyStatus {
    const [chatProvider] = useStorage<string>("chatProvider")
    const [chatApiKey] = useStorage<string>("chatApiKey")
    const [asrProvider] = useStorage<string>("asrProvider")
    const [asrApiKey] = useStorage<string>("asrApiKey")

    // While storage is still hydrating, treat as configured to avoid a brief
    // flash of the "Configure API Key" prompt before the real values arrive.
    const ready = chatApiKey !== undefined && asrApiKey !== undefined
    if (!ready) {
        return {
            hasChatKey: true,
            hasAsrKey: true,
            chatProvider: chatProvider ?? "OpenAI",
            asrProvider: asrProvider ?? "OpenAI"
        }
    }

    return {
        hasChatKey: Boolean(chatApiKey.trim()),
        hasAsrKey: Boolean(asrApiKey.trim()),
        chatProvider: chatProvider ?? "OpenAI",
        asrProvider: asrProvider ?? "OpenAI"
    }
}
