import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { acceptRevisions, assembleTranslation, validateTranslation } from "@/lib/translate/merge";

const original: Block[] = [
  { type: "heading", level: 2, text: "Hello" },
  { type: "figure", src: "https://x.com/a.png", original_src: "https://x.com/a.png", caption: "Chart", width: 10 },
  { type: "code", text: "x" },
  { type: "paragraph", text: [{ text: "World" }] },
];

describe("validateTranslation", () => {
  it("accepts matching indices and types, keeping figure src from original", () => {
    const map = validateTranslation(original, [0, 1], [
      { index: 0, block: { type: "heading", level: 2, text: "안녕" } },
      { index: 1, block: { type: "figure", src: "https://evil.com/x.png", caption: "차트" } },
    ]);
    expect(map?.get(0)).toEqual({ type: "heading", level: 2, text: "안녕" });
    expect(map?.get(1)).toEqual({ type: "figure", src: "https://x.com/a.png", original_src: "https://x.com/a.png", caption: "차트", width: 10 });
  });
  it("rejects type change", () => {
    expect(validateTranslation(original, [0], [{ index: 0, block: { type: "paragraph", text: [{ text: "안녕" }] } }])).toBeNull();
  });
  it("rejects missing index", () => {
    expect(validateTranslation(original, [0, 3], [{ index: 0, block: { type: "heading", level: 2, text: "안녕" } }])).toBeNull();
  });
  it("rejects unexpected or duplicate index", () => {
    expect(
      validateTranslation(original, [0], [
        { index: 0, block: { type: "heading", level: 2, text: "a" } },
        { index: 0, block: { type: "heading", level: 2, text: "b" } },
      ]),
    ).toBeNull();
    expect(validateTranslation(original, [0], [{ index: 3, block: { type: "paragraph", text: [{ text: "x" }] } }])).toBeNull();
  });
});

describe("assembleTranslation", () => {
  it("keeps index alignment and records untranslated translatable blocks", () => {
    const { body, untranslated } = assembleTranslation(original, [[0, { type: "heading", level: 2, text: "안녕" }]]);
    expect(body).toHaveLength(original.length);
    expect(body[0]).toEqual({ type: "heading", level: 2, text: "안녕" });
    expect(body[2]).toEqual(original[2]);
    expect(untranslated).toEqual([1, 3]);
  });
});

describe("fillTranslation", () => {
  it("replaces only the filled blocks and keeps the rest of the existing translation", async () => {
    const { fillTranslation } = await import("@/lib/translate/merge");
    const p = (t: string) => ({ type: "paragraph" as const, text: [{ text: t }] });
    const out = fillTranslation([p("가"), p("B"), p("다"), p("D")], [1, 3], [[1, p("나")]]);
    expect(out.body).toEqual([p("가"), p("나"), p("다"), p("D")]);
    expect(out.untranslated).toEqual([3]);
  });
});

describe("acceptRevisions", () => {
  const cur: Block[] = [
    { type: "paragraph", text: [{ text: "그녀는 그것에 대해 말했다. " }, { text: "링크", href: "https://a.com" }] },
    { type: "heading", level: 2, text: "제목입니다" },
    { type: "figure", src: "https://x.com/a.png", caption: "차트" },
  ];
  it("accepts a safe revision and keeps figure fields", () => {
    const out = acceptRevisions(cur, [0, 2], [
      { index: 0, block: { type: "paragraph", text: [{ text: "그는 이렇게 말했다. " }, { text: "링크", href: "https://a.com" }] } },
      { index: 2, block: { type: "figure", src: "https://evil.com", caption: "도표" } },
    ]);
    expect(out).toEqual([
      [0, { type: "paragraph", text: [{ text: "그는 이렇게 말했다. " }, { text: "링크", href: "https://a.com" }] }],
      [2, { type: "figure", src: "https://x.com/a.png", caption: "도표" }],
    ]);
  });
  it("drops revisions that change links, type, unrequested indices, or lose most of the text", () => {
    expect(
      acceptRevisions(cur, [0, 1], [
        { index: 0, block: { type: "paragraph", text: [{ text: "그는 이렇게 말했다. 링크" }] } },
        { index: 1, block: { type: "paragraph", text: [{ text: "제목" }] } },
        { index: 2, block: { type: "figure", src: "x", caption: "도표" } },
      ]),
    ).toEqual([]);
    expect(acceptRevisions(cur, [1], [{ index: 1, block: { type: "heading", level: 2, text: "제" } }])).toEqual([]);
  });
});
