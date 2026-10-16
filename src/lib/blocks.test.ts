import { describe, expect, it } from "vitest";
import { BlockSchema, blocksToPlainText, safeHref, type Block } from "@/lib/blocks";

describe("safeHref", () => {
  it("allows http and https", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
  });
  it("rejects other schemes and garbage", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("not a url")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe("BlockSchema", () => {
  it("accepts every block type", () => {
    const blocks: Block[] = [
      { type: "heading", level: 2, text: "제목" },
      { type: "paragraph", text: [{ text: "a" }, { text: "b", bold: true, href: "https://x.com" }] },
      { type: "quote", text: [{ text: "q" }] },
      { type: "list", ordered: false, items: [[{ text: "i1" }], [{ text: "i2" }]] },
      { type: "code", text: "x = 1" },
      { type: "figure", src: "https://x.com/a.png", caption: "그림 1" },
      { type: "table", rows: [["a", "b"], ["1", "2"]] },
      { type: "divider" },
    ];
    for (const b of blocks) expect(BlockSchema.parse(b)).toEqual(b);
  });
  it("rejects unknown type", () => {
    expect(BlockSchema.safeParse({ type: "video", src: "x" }).success).toBe(false);
  });
});

describe("blocksToPlainText", () => {
  it("joins text of blocks and skips figures without caption", () => {
    const text = blocksToPlainText([
      { type: "heading", level: 2, text: "H" },
      { type: "paragraph", text: [{ text: "Hello " }, { text: "world" }] },
      { type: "figure", src: "https://x.com/a.png" },
      { type: "figure", src: "https://x.com/b.png", caption: "Cap" },
      { type: "list", ordered: true, items: [[{ text: "one" }], [{ text: "two" }]] },
      { type: "divider" },
    ]);
    expect(text).toBe("H\n\nHello world\n\nCap\n\none\ntwo");
  });
});
