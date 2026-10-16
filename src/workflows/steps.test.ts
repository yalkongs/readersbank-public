import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/articles/repo", () => ({
  requireArticle: vi.fn(),
  updateArticle: vi.fn(),
  recordUsage: vi.fn(),
  listTagNames: vi.fn(),
  setArticleTags: vi.fn(),
  getTagNames: vi.fn(),
}));
vi.mock("@/lib/llm/client", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/client")>()), callJson: vi.fn() }));

import * as repo from "@/lib/articles/repo";
import { callJson, LlmTruncatedError } from "@/lib/llm/client";
import { reviewChunkStep, translateChunkStep } from "@/workflows/steps";

const brief = { topic: "t", audience: "a", tone: "x", glossary: [] };
const usage = { input: 1, output: 1, cacheRead: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repo.requireArticle).mockResolvedValue({
    bodyOriginal: [{ type: "paragraph", text: [{ text: "Hello" }] }],
  } as never);
});

describe("translateChunkStep", () => {
  it("returns translated entries when the response is valid", async () => {
    vi.mocked(callJson).mockResolvedValue({ data: { items: [{ index: 0, block: { type: "paragraph", text: [{ text: "안녕" }] } }] }, usage });
    const r = await translateChunkStep("a", brief, [0], "", 1, 1);
    expect(r.entries).toEqual([[0, { type: "paragraph", text: [{ text: "안녕" }] }]]);
    expect(r.tail).toBe("안녕");
  });
  it("translate chunk falls back to untranslated after two invalid responses", async () => {
    vi.mocked(callJson).mockResolvedValue({ data: { items: [{ index: 0, block: { type: "heading", level: 2, text: "x" } }] }, usage });
    const r = await translateChunkStep("a", brief, [0], "prev", 1, 1);
    expect(callJson).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ entries: [], tail: "prev" });
  });
  it("treats truncated responses as failed attempts instead of failing the article", async () => {
    vi.mocked(callJson).mockRejectedValue(new LlmTruncatedError("잘림"));
    const r = await translateChunkStep("a", brief, [0], "prev", 1, 1);
    expect(callJson).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ entries: [], tail: "prev" });
  });
});

describe("translateChunkStep context", () => {
  it("sends the whole original as cached context", async () => {
    vi.mocked(callJson).mockResolvedValue({ data: { items: [{ index: 0, block: { type: "paragraph", text: [{ text: "안녕" }] } }] }, usage });
    await translateChunkStep("a", brief, [0], "", 1, 1);
    expect(vi.mocked(callJson).mock.calls[0][0].cachedContext).toContain("[0] Hello");
  });
});

describe("reviewChunkStep", () => {
  beforeEach(() => {
    vi.mocked(repo.requireArticle).mockResolvedValue({
      bodyOriginal: [{ type: "paragraph", text: [{ text: "Hello there" }] }, { type: "paragraph", text: [{ text: "Bye" }] }],
      bodyKo: [{ type: "paragraph", text: [{ text: "안녕 거기" }] }, { type: "paragraph", text: [{ text: "Bye" }] }],
      untranslated: [1],
    } as never);
  });
  it("returns accepted revisions and skips untranslated blocks", async () => {
    vi.mocked(callJson).mockResolvedValue({ data: { items: [{ index: 0, block: { type: "paragraph", text: [{ text: "안녕하세요" }] } }] }, usage });
    const r = await reviewChunkStep("a", brief, [0, 1], 1, 1);
    expect(r.entries).toEqual([[0, { type: "paragraph", text: [{ text: "안녕하세요" }] }]]);
    expect(vi.mocked(callJson).mock.calls[0][0].user).not.toContain("Bye");
    expect(repo.recordUsage).toHaveBeenCalledWith("a", "review", usage);
  });
  it("keeps the current translation when the model call fails", async () => {
    vi.mocked(callJson).mockRejectedValue(new Error("boom"));
    expect(await reviewChunkStep("a", brief, [0], 1, 1)).toEqual({ entries: [] });
  });
});
