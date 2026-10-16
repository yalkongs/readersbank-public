import { describe, expect, it } from "vitest";
import { buildRelatedUser, parseRelated, urlKey } from "@/lib/related";

const item = (url: string, extra: Record<string, string> = {}) => ({ url, title: "T", titleKo: "제목", site: "S", why: "이유", ...extra });
const text = (items: unknown[]) => `검색했습니다.\n\`\`\`json\n${JSON.stringify({ items })}\n\`\`\``;

describe("parseRelated", () => {
  it("keeps only urls that came back from the search, drops the source and duplicates", () => {
    const searched = new Set(["https://a.com/1", "https://www.b.com/2/", "https://src.com/post"]);
    const out = parseRelated(
      text([item("https://a.com/1"), item("https://b.com/2"), item("https://a.com/1#x"), item("https://src.com/post"), item("https://invented.com/z")]),
      searched,
      "https://src.com/post?utm=1".replace("?utm=1", ""),
    );
    expect(out.map((o) => o.url)).toEqual(["https://a.com/1", "https://b.com/2"]);
  });
  it("rejects non-http urls, caps at 5, falls back to hostname and original title", () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://s${i}.com/p`);
    const out = parseRelated(text([item("javascript:alert(1)"), ...urls.map((u) => item(u, { site: "", titleKo: "" }))]), new Set([...urls, "javascript:alert(1)"]), null);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ site: "s0.com", titleKo: "T" });
  });
  it("reads bare JSON and returns [] for garbage", () => {
    expect(parseRelated(JSON.stringify({ items: [item("https://a.com/1")] }), new Set(["https://a.com/1"]), null)).toHaveLength(1);
    expect(parseRelated("검색 한도에 걸렸습니다.", new Set(), null)).toEqual([]);
    expect(parseRelated('{"items": "x"}', new Set(), null)).toEqual([]);
  });
  it("clips long fields", () => {
    const out = parseRelated(text([item("https://a.com/1", { why: "가".repeat(300) })]), new Set(["https://a.com/1"]), null);
    expect(out[0].why.length).toBe(160);
  });
});

describe("urlKey / buildRelatedUser", () => {
  it("normalizes protocol, www, trailing slash, hash", () => {
    expect(urlKey("http://www.A.com/x/#h")).toBe(urlKey("https://a.com/x"));
    expect(urlKey("not a url")).toBeNull();
  });
  it("includes titles, source and summary", () => {
    const u = buildRelatedUser({ titleKo: "한", titleOriginal: "Orig", sourceUrl: "https://s.com", leadKo: null, summaryKo: ["요점"] });
    expect(u).toContain("원제: Orig");
    expect(u).toContain("원문 주소: https://s.com");
    expect(u).toContain("- 요점");
    expect(u).not.toContain("한 줄 소개");
  });
});
