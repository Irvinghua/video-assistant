/** Extract the Douyin aweme (video) id from any of the 3 page-form URLs. */
export function extractAwemeId(url: string): string | null {
    try {
        const u = new URL(url)
        const m = u.pathname.match(/\/video\/(\d+)/)
        if (m) return m[1]
        const modalId = u.searchParams.get("modal_id")
        if (modalId && /^\d+$/.test(modalId)) return modalId
        const vid = u.searchParams.get("vid")
        if (vid && /^\d+$/.test(vid)) return vid
        return null
    } catch {
        return null
    }
}
