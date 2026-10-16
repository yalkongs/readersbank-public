import { describe, expect, it } from "vitest";
import { extractFromText, parseInline } from "@/lib/extract/text";
import { assertContentSize, ExtractError } from "@/lib/extract/types";

describe("parseInline", () => {
  it("parses bold, italic and safe links", () => {
    expect(parseInline("a **b** *c* [d](https://x.com) [e](javascript:1)")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", href: "https://x.com/" },
      { text: " " },
      { text: "e" },
    ]);
  });
});

describe("extractFromText", () => {
  it("uses first heading as title and builds blocks", () => {
    const r = extractFromText(
      ["# My Title", "", "First para line one", "line two", "", "## Section", "- a", "- b", "1. x", "", "> quote", "", "![Fig 1](https://x.com/a.png)", "", "```", "code", "```", "---"].join("\n"),
    );
    expect(r.title).toBe("My Title");
    expect(r.coverImage).toBe("https://x.com/a.png");
    expect(r.blocks).toEqual([
      { type: "paragraph", text: [{ text: "First para line one line two" }] },
      { type: "heading", level: 2, text: "Section" },
      { type: "list", ordered: false, items: [[{ text: "a" }], [{ text: "b" }]] },
      { type: "list", ordered: true, items: [[{ text: "x" }]] },
      { type: "quote", text: [{ text: "quote" }] },
      { type: "figure", src: "https://x.com/a.png", original_src: "https://x.com/a.png", caption: "Fig 1" },
      { type: "code", text: "code" },
      { type: "divider" },
    ]);
  });
  it("falls back to first line (max 80 chars) as title for plain text", () => {
    const r = extractFromText("Plain first line\n\nBody");
    expect(r.title).toBe("Plain first line");
    expect(r.blocks[0]).toEqual({ type: "paragraph", text: [{ text: "Plain first line" }] });
  });
});

describe("assertContentSize", () => {
  it("rejects too-short content", () => {
    expect(() => assertContentSize([{ type: "paragraph", text: [{ text: "짧음" }] }])).toThrow(ExtractError);
  });
  it("accepts enough content", () => {
    expect(() => assertContentSize([{ type: "paragraph", text: [{ text: "가".repeat(250) }] }])).not.toThrow();
  });
});

describe("parseInline with math", () => {
  it("keeps * and _ inside math untouched", () => {
    expect(parseInline("곱은 $a * b * c$ 이고 **굵게**")).toEqual([{ text: "곱은 $a * b * c$ 이고 " }, { text: "굵게", bold: true }]);
    expect(parseInline("\\[ x_*^* \\] 끝")).toEqual([{ text: "\\[ x_*^* \\] 끝" }]);
  });
});
