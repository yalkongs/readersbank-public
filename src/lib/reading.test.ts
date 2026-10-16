import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { headingId, tocEntries } from "@/lib/reading";

const p: Block = { type: "paragraph", text: [{ text: "a" }] };
const h = (text: string, level: 2 | 3 | 4 = 2): Block => ({ type: "heading", level, text });

describe("tocEntries", () => {
  it("returns [] under 3 headings", () => {
    expect(tocEntries([h("a"), p, h("b")])).toEqual([]);
  });
  it("returns id/level/text by block index", () => {
    expect(tocEntries([h("a"), p, h("b", 3), h("c", 4)])).toEqual([
      { id: "h-0", level: 2, text: "a" },
      { id: "h-2", level: 3, text: "b" },
      { id: "h-3", level: 4, text: "c" },
    ]);
    expect(headingId(5)).toBe("h-5");
  });
});
