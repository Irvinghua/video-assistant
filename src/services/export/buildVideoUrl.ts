export function buildVideoUrl(platform: string, videoId: string): string {
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${videoId}`
  if (platform === "bilibili") return `https://www.bilibili.com/video/${videoId}`
  if (platform === "douyin") return `https://www.douyin.com/video/${videoId}`
  return ""
}
