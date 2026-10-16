import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { pickVoice, speechSegments } from "@/lib/speech";

describe("speechSegments", () => {
  it("reads heading, paragraph, quote, list (joined), figure caption with original indexes", () => {
    const blocks: Block[] = [
      { type: "heading", level: 2, text: "제목" },
      { type: "paragraph", text: [{ text: "가" }, { text: "나", bold: true }] },
      { type: "quote", text: [{ text: "인용" }] },
      { type: "list", ordered: false, items: [[{ text: "하나" }], [{ text: "둘" }]] },
      { type: "figure", src: "https://x.com/a.png", caption: "그림 1" },
    ];
    expect(speechSegments(blocks)).toEqual([
      { index: 0, text: "제목" },
      { index: 1, text: "가나" },
      { index: 2, text: "인용" },
      { index: 3, text: "하나. 둘" },
      { index: 4, text: "그림 1" },
    ]);
  });
  it("skips table, code, divider, empty text and captionless figures", () => {
    const blocks: Block[] = [
      { type: "table", rows: [["a", "b"]] },
      { type: "code", text: "x = 1" },
      { type: "divider" },
      { type: "paragraph", text: [{ text: "   " }] },
      { type: "figure", src: "https://x.com/a.png" },
      { type: "paragraph", text: [{ text: "남음" }] },
    ];
    expect(speechSegments(blocks)).toEqual([{ index: 5, text: "남음" }]);
  });
  it("splits long paragraphs at sentence boundaries, keeping the same index and max 400 chars", () => {
    const sentence = "이것은 꽤 긴 문장입니다만 계속 이어집니다. ";
    const text = sentence.repeat(40).trim();
    const segs = speechSegments([{ type: "paragraph", text: [{ text }] }]);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) {
      expect(s.index).toBe(0);
      expect(s.text.length).toBeLessThanOrEqual(400);
      expect(s.text.endsWith("이어집니다.")).toBe(true);
    }
    expect(segs.map((s) => s.text).join(" ")).toBe(text);
  });
  it("hard-splits a long text without sentence boundaries", () => {
    const segs = speechSegments([{ type: "paragraph", text: [{ text: "가".repeat(900) }] }]);
    expect(segs.map((s) => s.text.length)).toEqual([400, 400, 100]);
  });
});

describe("pickVoice", () => {
  it("prefers ko-KR over other ko, and local over remote", () => {
    expect(pickVoice([{ lang: "ko", name: "a" }, { lang: "ko-KR", name: "b" }])?.name).toBe("b");
    expect(
      pickVoice([
        { lang: "ko-KR", name: "remote", localService: false },
        { lang: "ko-KR", name: "local", localService: true },
      ])?.name,
    ).toBe("local");
  });
  it("falls back to ko prefix, else null", () => {
    expect(pickVoice([{ lang: "en-US", name: "e" }, { lang: "ko", name: "k" }])?.name).toBe("k");
    expect(pickVoice([{ lang: "en-US", name: "e" }])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});
