import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { chunkBlocks, needsTranslation } from "@/lib/translate/chunk";

const p = (n: number): Block => ({ type: "paragraph", text: [{ text: "x".repeat(n) }] });

describe("needsTranslation", () => {
  it("skips code, divider and caption-less figures", () => {
    expect(needsTranslation({ type: "code", text: "x" })).toBe(false);
    expect(needsTranslation({ type: "divider" })).toBe(false);
    expect(needsTranslation({ type: "figure", src: "https://x.com/a.png" })).toBe(false);
    expect(needsTranslation({ type: "figure", src: "https://x.com/a.png", caption: "c" })).toBe(true);
    expect(needsTranslation(p(1))).toBe(true);
  });
});

describe("chunkBlocks", () => {
  it("groups indices up to maxChars and skips non-translatable blocks", () => {
    const blocks: Block[] = [p(40), { type: "divider" }, p(40), p(40), { type: "code", text: "c" }, p(40)];
    expect(chunkBlocks(blocks, 170)).toEqual([[0, 2], [3, 5]]);
  });
  it("oversized single block becomes its own chunk", () => {
    const blocks: Block[] = [p(10), p(500), p(10)];
    expect(chunkBlocks(blocks, 100)).toEqual([[0], [1], [2]]);
  });
  it("returns empty for nothing to translate", () => {
    expect(chunkBlocks([{ type: "divider" }])).toEqual([]);
  });
});

describe("chunkBlocks only", () => {
  it("chunks only the given indices", async () => {
    const { chunkBlocks } = await import("@/lib/translate/chunk");
    const p = (t: string) => ({ type: "paragraph" as const, text: [{ text: t }] });
    expect(chunkBlocks([p("a"), p("b"), p("c"), p("d")], 7000, new Set([1, 3]))).toEqual([[1, 3]]);
  });
});
