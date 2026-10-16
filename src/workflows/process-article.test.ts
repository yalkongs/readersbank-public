import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/workflows/steps", () => ({
  extractStep: vi.fn(),
  detectLangStep: vi.fn(),
  hasTranslationStep: vi.fn(),
  briefStep: vi.fn(),
  planChunksStep: vi.fn(),
  planFillChunksStep: vi.fn(),
  saveFillStep: vi.fn(),
  translateChunkStep: vi.fn(),
  saveTranslationStep: vi.fn(),
  reviewChunkStep: vi.fn(),
  saveReviewStep: vi.fn(),
  summarizeStep: vi.fn(),
  publishStep: vi.fn(),
  relatedStep: vi.fn(),
  markFailedStep: vi.fn(),
}));

import * as steps from "@/workflows/steps";
import { processArticle } from "@/workflows/process-article";

const m = vi.mocked(steps);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("processArticle", () => {
  it("translates english articles in groups of 3 passing previous group's tail", async () => {
    m.detectLangStep.mockResolvedValue("en");
    m.briefStep.mockResolvedValue({ topic: "t", audience: "a", tone: "x", glossary: [] });
    m.planChunksStep.mockResolvedValue([[0], [1], [2], [3]]);
    m.translateChunkStep.mockImplementation(async (_id, _b, indices) => ({ entries: [], tail: `tail-${indices[0]}` }));

    await expect(processArticle("a1")).resolves.toEqual({ status: "published" });

    expect(m.translateChunkStep).toHaveBeenCalledTimes(4);
    const calls = m.translateChunkStep.mock.calls;
    expect(calls.slice(0, 3).map((c) => c[3])).toEqual(["", "", ""]);
    expect(calls[3][3]).toBe("tail-2");
    expect(calls.map((c) => [c[4], c[5]])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    expect(m.saveTranslationStep).toHaveBeenCalledWith("a1", expect.arrayContaining([{ entries: [], tail: "tail-3" }]));
    expect(m.reviewChunkStep.mock.calls.map((c) => [c[2], c[3], c[4]])).toEqual([[[0], 1, 4], [[1], 2, 4], [[2], 3, 4], [[3], 4, 4]]);
    expect(m.saveReviewStep.mock.invocationCallOrder[0]).toBeGreaterThan(m.saveTranslationStep.mock.invocationCallOrder[0]);
    expect(m.summarizeStep.mock.invocationCallOrder[0]).toBeGreaterThan(m.saveReviewStep.mock.invocationCallOrder[0]);
    expect(m.summarizeStep).toHaveBeenCalledWith("a1");
    expect(m.relatedStep).toHaveBeenCalledWith("a1");
    expect(m.relatedStep.mock.invocationCallOrder[0]).toBeGreaterThan(m.publishStep.mock.invocationCallOrder[0]);
    expect(m.publishStep).toHaveBeenCalledWith("a1");
  });

  it("skips brief and translation when an english article already has a translation (resume)", async () => {
    m.detectLangStep.mockResolvedValue("en");
    m.hasTranslationStep.mockResolvedValue(true);
    await expect(processArticle("a5")).resolves.toEqual({ status: "published" });
    expect(m.briefStep).not.toHaveBeenCalled();
    expect(m.translateChunkStep).not.toHaveBeenCalled();
    expect(m.saveTranslationStep).not.toHaveBeenCalled();
    expect(m.summarizeStep).toHaveBeenCalledWith("a5");
  });

  it("skips translation for korean", async () => {
    m.detectLangStep.mockResolvedValue("ko");
    await processArticle("a2");
    expect(m.briefStep).not.toHaveBeenCalled();
    expect(m.translateChunkStep).not.toHaveBeenCalled();
    expect(m.publishStep).toHaveBeenCalledWith("a2");
  });

  it("translates every non-korean language (ja, fr)", async () => {
    m.planChunksStep.mockResolvedValue([]);
    for (const [id, lang] of [["a3", "ja"], ["a5", "fr"]]) {
      m.briefStep.mockClear();
      m.detectLangStep.mockResolvedValue(lang);
      await processArticle(id);
      expect(m.briefStep).toHaveBeenCalledWith(id);
    }
  });

  it("fill mode translates only the missing chunks, skips extract/summarize/related, and republishes", async () => {
    m.briefStep.mockResolvedValue({ topic: "t", audience: "a", tone: "x", glossary: [] });
    m.planFillChunksStep.mockResolvedValue([[3], [7]]);
    m.translateChunkStep.mockImplementation(async (_id, _b, indices) => ({ entries: [], tail: `t${indices[0]}` }));
    await expect(processArticle("f1", "fill")).resolves.toEqual({ status: "published" });
    expect(m.extractStep).not.toHaveBeenCalled();
    expect(m.planChunksStep).not.toHaveBeenCalled();
    expect(m.translateChunkStep).toHaveBeenCalledTimes(2);
    expect(m.saveFillStep).toHaveBeenCalledWith("f1", expect.any(Array));
    expect(m.summarizeStep).not.toHaveBeenCalled();
    expect(m.relatedStep).not.toHaveBeenCalled();
    expect(m.publishStep).toHaveBeenCalledWith("f1");
  });

  it("marks the article failed and rethrows when a step fails", async () => {
    m.extractStep.mockRejectedValue(new Error("본문을 가져오지 못했습니다"));
    await expect(processArticle("a4")).rejects.toThrow("본문을 가져오지 못했습니다");
    expect(m.markFailedStep).toHaveBeenCalledWith("a4", "본문을 가져오지 못했습니다");
    expect(m.publishStep).not.toHaveBeenCalled();
  });
});
