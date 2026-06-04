import { useState } from "react"
import { Download } from "lucide-react"
import { useVideo } from "../../contexts/VideoContext"
import { useTranslation } from "../../i18n/useTranslation"
import { ExportService, type TargetId } from "../../services/export/ExportService"
import { buildNoteDocument, type NoteLabels } from "../../services/export/NoteBuilder"
import { buildVideoUrl } from "../../services/export/buildVideoUrl"

export function ExportMenu() {
  const { cachedData, videoInfo, platform } = useVideo()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState("")

  const hasContent = !!(cachedData.summary || cachedData.comments || cachedData.mindmap)

  const labels: NoteLabels = {
    summarySection: t("exportMenu.labels.summarySection"),
    commentsSection: t("exportMenu.labels.commentsSection"),
    mindmapSection: t("exportMenu.labels.mindmapSection"),
    oneLiner: t("exportMenu.labels.oneLiner"),
    keyPoints: t("exportMenu.labels.keyPoints"),
    fullDigest: t("exportMenu.labels.fullDigest"),
    consensus: t("exportMenu.labels.consensus"),
    divergences: t("exportMenu.labels.divergences"),
    gap: t("exportMenu.labels.gap"),
    gapHit: t("exportMenu.labels.gapHit"),
    gapMiss: t("exportMenu.labels.gapMiss"),
    mood: t("exportMenu.labels.mood"),
    spotlight: t("exportMenu.labels.spotlight"),
    // source/author/exportedAt are unused by NoteBuilder rendering; pass empty.
    source: "",
    author: "",
    exportedAt: ""
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 2500)
  }

  const handle = async (id: TargetId) => {
    setOpen(false)
    if (!hasContent || !videoInfo) {
      flash(t("exportMenu.empty"))
      return
    }
    const doc = buildNoteDocument({
      title: videoInfo.title,
      sourceUrl: buildVideoUrl(platform, videoInfo.id),
      platform,
      author: videoInfo.author,
      exportedAt: new Date().toISOString().slice(0, 10),
      summary: cachedData.summary,
      comments: cachedData.comments,
      mindmap: cachedData.mindmap,
      labels
    })
    try {
      const result = await ExportService.exportTo(id, doc)
      if (result.kind === "invoked") flash(t("exportMenu.obsidianInvoked"))
      else if (result.kind === "fallback-download") flash(t("exportMenu.fallbackDownloaded"))
      else if (id === "notion") flash(t("exportMenu.notionSuccess"))
      else flash(t("exportMenu.downloaded"))
    } catch (e) {
      const code = (e as Error).message
      if (code === "TARGET_NOT_CONFIGURED") flash(t("exportMenu.needConfig"))
      else if (code === "NOTION_UNAUTHORIZED") flash(t("exportMenu.errorUnauthorized"))
      else if (code === "NOTION_PARENT_NOT_FOUND") flash(t("exportMenu.errorParentNotFound"))
      else if (code === "NOTION_RATE_LIMITED") flash(t("exportMenu.errorRateLimited"))
      else flash(t("exportMenu.errorGeneric"))
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"
        title={t("exportMenu.button")}
      >
        <Download size={18} />
      </button>
      {open && (
        <div className="absolute end-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 text-sm">
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("notion")}>{t("exportMenu.toNotion")}</button>
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("obsidian")}>{t("exportMenu.toObsidian")}</button>
          <button className="block w-full text-start px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handle("download")}>{t("exportMenu.download")}</button>
        </div>
      )}
      {toast && (
        <div className="absolute end-0 top-9 whitespace-nowrap px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-50">{toast}</div>
      )}
    </div>
  )
}
