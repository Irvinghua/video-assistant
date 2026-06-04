import { Storage } from "@plasmohq/storage"
import type { SummaryResult } from "../ai/types"
import type { NoteDocument } from "./NoteDocument"
import type { ExportTarget, ExportResult } from "./targets/ExportTarget"
import { NotionTarget } from "./targets/NotionTarget"
import { ObsidianTarget } from "./targets/ObsidianTarget"
import { DownloadTarget } from "./targets/DownloadTarget"
import { TokenNotionClient } from "./NotionClient"

const storage = new Storage()

export type TargetId = "notion" | "obsidian" | "download"

export class ExportService {
  // ── 旧能力：仅下载总结（useSummary 在用，保持兼容）──
  static toMarkdown(summary: SummaryResult, videoTitle: string, videoUrl: string): string {
    const lines = [
      `# ${videoTitle}`,
      `Source: ${videoUrl}`,
      `\n## One Liner`,
      summary.oneLiner,
      `\n## Key Points`
    ]
    summary.chapters.forEach(chap => {
      const m = Math.floor(chap.timestamp / 60)
      const s = Math.floor(chap.timestamp % 60).toString().padStart(2, "0")
      lines.push(`- **${m}:${s}** ${chap.title}`)
      lines.push(`  - ${chap.summary}`)
    })
    lines.push(`\n## Full Digest`)
    lines.push(summary.fullDigest)
    return lines.join("\n")
  }

  static download(content: string, filename: string) {
    new DownloadTarget().download(content, filename)
  }

  // ── 新能力：多目标导出 ──
  static async buildTarget(id: TargetId): Promise<ExportTarget> {
    if (id === "download") return new DownloadTarget()
    if (id === "notion") {
      const token = (await storage.get("notionToken")) || ""
      const parentId = (await storage.get("notionParentPageId")) || ""
      return new NotionTarget(new TokenNotionClient(token), parentId)
    }
    const vault = (await storage.get("obsidianVault")) || ""
    const folder = (await storage.get("obsidianFolder")) || ""
    return new ObsidianTarget(vault, folder)
  }

  static async exportTo(id: TargetId, doc: NoteDocument): Promise<ExportResult> {
    const target = await ExportService.buildTarget(id)
    return target.export(doc)
  }
}
