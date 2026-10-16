import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleCard, quoteColor, type ArticleCardJSON } from "@/components/ArticleCard";

const base: ArticleCardJSON = {
  slug: "s1",
  titleKo: "제목",
  titleOriginal: "Title",
  leadKo: "요약",
  quoteKo: "핵심 문장",
  coverImage: "https://example.com/a.png",
  coverGenerated: false,
  lang: "ko",
  sourceUrl: "https://www.example.com/post/1",
  publishedAt: "2026-10-01T00:00:00.000Z",
};

describe("ArticleCard", () => {
  it("omits img for unsafe cover", () => {
    const html = renderToStaticMarkup(<ArticleCard a={{ ...base, coverImage: "javascript:alert(1)" }} variant="card" />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });
  it("renders lazy img for safe cover", () => {
    const html = renderToStaticMarkup(<ArticleCard a={base} variant="card" />);
    expect(html).toContain('loading="lazy"');
  });
  it("shows the date and source domain instead of a 번역됨 badge", () => {
    const html = renderToStaticMarkup(<ArticleCard a={{ ...base, lang: "en" }} variant="card" />);
    expect(html).toContain("example.com");
    expect(html).toContain('dateTime="2026-10-01T00:00:00.000Z"');
    expect(html).not.toContain("번역됨");
    expect(renderToStaticMarkup(<ArticleCard a={{ ...base, sourceUrl: "javascript:x" }} variant="card" />)).not.toContain("javascript:");
  });
  it("renders a quote cover when there is no cover image", () => {
    const html = renderToStaticMarkup(<ArticleCard a={{ ...base, coverImage: null }} variant="card" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("핵심 문장");
    expect(html).toContain(`background-color:${quoteColor("s1")}`);
  });
  it("prefers the real cover over the quote, and skips the quote cover when there is no quote", () => {
    expect(renderToStaticMarkup(<ArticleCard a={base} variant="hero" />)).not.toContain("핵심 문장");
    const none = renderToStaticMarkup(<ArticleCard a={{ ...base, coverImage: null, quoteKo: null }} variant="hero" />);
    expect(none).not.toContain("ReadersBank");
  });
  it("picks a stable color per slug", () => {
    expect(quoteColor("abc")).toBe(quoteColor("abc"));
  });
  it("does not label AI-generated covers", () => {
    expect(renderToStaticMarkup(<ArticleCard a={{ ...base, coverGenerated: true }} variant="card" />)).not.toContain("AI 이미지");
  });
});
