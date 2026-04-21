import { useState, useEffect } from "react"
import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import cssText from "data-text:~style.css"

import { YouTubeService } from "../services/platform/youtube/YouTubeService"
import { Sidebar } from "../components/Sidebar"
import { ToggleButton } from "../components/ToggleButton"
import { I18nProvider } from "../i18n/I18nProvider"

export const config: PlasmoCSConfig = {
    matches: ["https://www.youtube.com/watch*"],
    all_frames: false
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId: PlasmoGetShadowHostId = () => "video-assistant-youtube"

export const getShadowHostStyle = () => {
    const style = document.createElement("style")
    style.textContent = `
        #video-assistant-youtube {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
        }
        #video-assistant-youtube > * {
            pointer-events: auto !important;
        }
    `
    return style
}

const service = new YouTubeService()

const YouTubeCS = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        console.log("[VideoAssistant] YouTube content script mounted")
    }, [])

    useEffect(() => {
        const checkTheme = () => {
            const html = document.documentElement
            const isDarkMode = html.hasAttribute("dark") || html.getAttribute("dark") === "true"
            setIsDark(isDarkMode)
        }
        checkTheme()
        const observer = new MutationObserver(checkTheme)
        observer.observe(document.documentElement, { attributes: true })
        return () => observer.disconnect()
    }, [])

    return (
        <I18nProvider>
            <div className={isDark ? "dark" : ""} style={{ pointerEvents: "auto" }}>
                <ToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
                <Sidebar service={service} isOpen={isOpen} onClose={() => setIsOpen(false)} />
            </div>
        </I18nProvider>
    )
}

export default YouTubeCS
