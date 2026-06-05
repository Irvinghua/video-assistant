import { describe, it, expect, vi } from "vitest"
import { generateMindmapMarkdown } from "./MindmapGenerator"
import type { IAIService } from "../ai/types"

function fakeService(reply: string): IAIService {
  return {
    summarize: vi.fn(),
    analyzeComments: vi.fn(),
    chat: vi.fn(async () => reply),
    getModelName: () => "fake"
  }
}

describe("generateMindmapMarkdown", () => {
  it("strips ``` fences and trims", async () => {
    const svc = fakeService("```markdown\n# 根\n- 枝\n```")
    const md = await generateMindmapMarkdown("短脚本", "Chinese", svc)
    expect(md).toBe("# 根\n- 枝")
  })

  it("passes the script through the mindmap prompt for short input (single chunk)", async () => {
    const svc = fakeService("# T")
    await generateMindmapMarkdown("hello", "English", svc)
    expect((svc.chat as any).mock.calls.length).toBe(1)
  })
})
