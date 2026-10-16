import { describe, expect, it } from "vitest";
import { normalizeSummary } from "@/lib/summarize";

describe("normalizeSummary", () => {
  it("trims, dedupes tags case-insensitively and caps counts", () => {
    const r = normalizeSummary({
      title_ko: "  제목 ",
      lead_ko: " 리드 ",
      summary: ["a", " ", "b", "c", "d", "e", "f"],
      tags: ["AI", "ai", " 정렬 ", "", "연구", "윤리", "정책"],
    });
    expect(r).toEqual({ titleKo: "제목", leadKo: "리드", summary: ["a", "b", "c", "d", "e"], tags: ["AI", "정렬", "연구", "윤리"] });
  });

  it("drops tags containing CJK ideographs or kana", () => {
    const r = normalizeSummary({
      title_ko: "t",
      lead_ko: "l",
      summary: ["a"],
      tags: ["생산性", "テスト", "AI", "생산성", "UX 디자인"],
    });
    expect(r.tags).toEqual(["AI", "생산성", "UX 디자인"]);
  });
});
