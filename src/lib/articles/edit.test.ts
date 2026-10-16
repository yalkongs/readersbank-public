import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { EditError, bodyToMarkdown, buildSearchText, editedBodyField, inlineToMarkdown, markdownToBody, sameStructure, validateTitle } from "@/lib/articles/edit";

const blocks: Block[] = [
  { type: "heading", level: 2, text: "소제목" },
  { type: "paragraph", text: [{ text: "앞 " }, { text: "굵게", bold: true }, { text: " " }, { text: "링크", href: "https://a.com/" }, { text: " 5 * 3 * 2" }] },
  { type: "list", ordered: false, items: [[{ text: "하나" }], [{ text: "둘", italic: true }]] },
  { type: "figure", src: "https://b.com/x.png", caption: "그림" },
  { type: "table", rows: [["a"]] },
  { type: "divider" },
  { type: "code", text: "x = 1" },
];

describe("bodyToMarkdown / markdownToBody", () => {
  it("serializes every block type as markdown chunks", () => {
    const md = bodyToMarkdown([...blocks, { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", start: 42 }]);
    expect(md).toBe(
      [
        "## 소제목",
        "앞 **굵게** [링크](https://a.com/) 5 * 3 * 2",
        "- 하나\n- *둘*",
        "![그림](https://b.com/x.png)",
        "| a |",
        "---",
        "```\nx = 1\n```",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      ].join("\n\n"),
    );
  });

  it("round-trips unchanged text to byte-identical blocks (no lossy reparse)", () => {
    const tricky: Block[] = [
      ...blocks,
      { type: "paragraph", text: [{ text: "- 대시로 시작\n## 이것도 글" }] },
      { type: "paragraph", text: [{ text: "\\[ x^2 \\]" }] },
      { type: "code", text: "```\ninner\n```\n\n빈 줄 포함" },
      { type: "table", rows: [["a|b", "c"], ["", "d"]] },
      { type: "figure", src: "https://b.com/y.png", width: 10, height: 20, alt: "설명" },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ" },
    ];
    expect(markdownToBody(bodyToMarkdown(tricky), tricky)).toEqual(tricky);
    // 이전 블록이 없어도(새로 해석해도) 같은 구조가 나온다.
    expect(markdownToBody(bodyToMarkdown(tricky), []).map((b) => b.type)).toEqual(tricky.map((b) => b.type));
  });

  it("allows adding, deleting, reordering and changing block types", () => {
    const md = ["### 새 소제목", "문단 **하나**\n이어짐", "> 인용으로", "1. 가\n2. 나", "https://youtu.be/dQw4w9WgXcQ?t=1m5s", "![](https://b.com/x.png)"].join("\n\n");
    expect(markdownToBody(md, blocks)).toEqual([
      { type: "heading", level: 3, text: "새 소제목" },
      { type: "paragraph", text: [{ text: "문단 " }, { text: "하나", bold: true }, { text: " 이어짐" }] },
      { type: "quote", text: [{ text: "인용으로" }] },
      { type: "list", ordered: true, items: [[{ text: "가" }], [{ text: "나" }]] },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", start: 65 },
      // 같은 그림을 다시 쓰면 원래 속성은 남기고 설명만 바꾼다.
      { type: "figure", src: "https://b.com/x.png" },
    ]);
  });

  it("splits a chunk when single-line blocks sit between text lines", () => {
    const out = markdownToBody("앞 문단\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n뒤 문단", []);
    expect(out.map((b) => b.type)).toEqual(["paragraph", "video", "paragraph"]);
  });

  it("rejects empty bodies, bad input and non-http images; unsafe links stay unlinked", () => {
    expect(() => markdownToBody(" \n\n ", blocks)).toThrow(EditError);
    expect(() => markdownToBody(3, blocks)).toThrow(EditError);
    expect(() => markdownToBody("![x](javascript:alert(1))", blocks)).toThrow(EditError);
    expect(JSON.stringify(markdownToBody("[x](javascript:alert(1))", blocks))).not.toContain("javascript:");
  });

  it("sameStructure compares block type order", () => {
    expect(sameStructure(blocks, markdownToBody(bodyToMarkdown(blocks), blocks))).toBe(true);
    expect(sameStructure(blocks, blocks.slice(1))).toBe(false);
  });
});

describe("validateTitle / editedBodyField / buildSearchText / inlineToMarkdown", () => {
  it("validates titles", () => {
    expect(validateTitle("  새   제목 ")).toBe("새 제목");
    expect(() => validateTitle(" ")).toThrow(EditError);
    expect(() => validateTitle("가".repeat(201))).toThrow(EditError);
    expect(() => validateTitle(3)).toThrow(EditError);
  });
  it("edits the translation only for translated articles", () => {
    expect(editedBodyField({ lang: "en", bodyKo: [] })).toBe("bodyKo");
    expect(editedBodyField({ lang: "ja", bodyKo: null })).toBe("bodyOriginal");
    expect(editedBodyField({ lang: "ko", bodyKo: null })).toBe("bodyOriginal");
  });
  it("builds search text from the displayed body", () => {
    const t = buildSearchText(
      { titleKo: "제목", titleOriginal: null, leadKo: null, summaryKo: ["요약"], bodyKo: [{ type: "paragraph", text: [{ text: "본문" }] }], bodyOriginal: null },
      ["태그"],
    );
    expect(t).toBe("제목\n요약\n태그\n본문");
  });
  it("serializes bold links", () => {
    expect(inlineToMarkdown([{ text: "a", bold: true, href: "https://x.com/" }])).toBe("**[a](https://x.com/)**");
  });
});
