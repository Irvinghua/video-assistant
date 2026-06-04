export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned.replace(/^-+|-+$/g, "").trim() || "untitled"
}
