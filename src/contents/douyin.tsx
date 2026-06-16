import { useState, useEffect } from "react"
import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import cssText from "data-text:~style.css"

import { DouyinService } from "../services/platform/douyin/DouyinService"
import { extractAwemeId } from "../services/platform/douyin/awemeId"
import { loadAweme } from "../services/platform/douyin/playerBridge"
import { Sidebar } from "../components/Sidebar"
import { ToggleButton } from "../components/ToggleButton"
import { I18nProvider } from "../i18n/I18nProvider"

export const config: PlasmoCSConfig = {
    matches: ["https://www.douyin.com/*"],
    all_frames: false
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId: PlasmoGetShadowHostId = () => "video-assistant-douyin"

export const getShadowHostStyle = () => {
    const style = document.createElement("style")
    style.textContent = `
        #video-assistant-douyin {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 0 !important;
            height: 0 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
        }
        #video-assistant-douyin > * {
            pointer-events: auto !important;
        }
    `
    return style
}

const service = new DouyinService()

/** Watch modal_id / path changes (SPA swiper) and produce a navKey that
 *  changes only AFTER the player cache for the new video is populated. */
function useDouyinNavKey(): string {
    const [navKey, setNavKey] = useState("")
    useEffect(() => {
        let loadedId = ""   // id we have SUCCESSFULLY loaded into the cache
        let inFlight = false
        let disposed = false
        const tick = async () => {
            const id = extractAwemeId(location.href) || ""
            if (!id) {
                if (loadedId) { loadedId = ""; if (!disposed) setNavKey("") }
                return
            }
            if (id === loadedId || inFlight) return
            inFlight = true
            try {
                // May fail with "no-player" if xgplayer isn't initialized yet;
                // leave loadedId unchanged so a later tick retries.
                const aweme = await loadAweme(id)
                if (aweme && !disposed) { loadedId = id; setNavKey(id) }
            } finally {
                inFlight = false
            }
        }
        const origPush = history.pushState
        const origReplace = history.replaceState
        history.pushState = function (...a: any[]) { const r = origPush.apply(this, a as any); queueMicrotask(tick); return r }
        history.replaceState = function (...a: any[]) { const r = origReplace.apply(this, a as any); queueMicrotask(tick); return r }
        window.addEventListener("popstate", tick)
        const iv = setInterval(tick, 1000)   // fallback for missed transitions
        tick()
        return () => {
            disposed = true
            history.pushState = origPush
            history.replaceState = origReplace
            window.removeEventListener("popstate", tick)
            clearInterval(iv)
        }
    }, [])
    return navKey
}

const DouyinCS = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isDark] = useState(true)   // Douyin web is dark-themed
    const navKey = useDouyinNavKey()

    useEffect(() => {
        console.log("[VideoAssistant] Douyin content script mounted")
    }, [])

    return (
        <I18nProvider>
            <div className={isDark ? "dark" : ""} style={{ pointerEvents: "auto" }}>
                <ToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
                <Sidebar service={service} isOpen={isOpen} navKey={navKey} onClose={() => setIsOpen(false)} />
            </div>
        </I18nProvider>
    )
}

export default DouyinCS
