import { describe, expect, it } from "vitest";
import { extractFromX } from "@/lib/extract/x";
import { ExtractError } from "@/lib/extract/types";
import { parseXArticle } from "@/lib/extract/x-article";

const article = {
  id: "2108928845969780736",
  title: "Long-form title",
  cover_media: { media_info: { __typename: "ApiImage", original_img_url: "https://pbs.twimg.com/media/cover.jpg" } },
  media_entities: [{ media_id: "m1", media_info: { __typename: "ApiImage", original_img_url: "https://pbs.twimg.com/media/fig.jpg", original_img_width: 1200, original_img_height: 800, ext_alt_text: "a chart" } }],
  content: {
    entityMap: [
      { key: "1", value: { type: "MEDIA", data: { mediaItems: [{ mediaId: "m1" }] } } },
      { key: "0", value: { type: "LINK", data: { url: "https://example.com/x" } } },
      { key: "2", value: { type: "DIVIDER", data: {} } },
      { key: "3", value: { type: "LINK", data: { url: "javascript:alert(1)" } } },
    ],
    blocks: [
      { type: "header-one", text: "Intro", entityRanges: [], inlineStyleRanges: [] },
      { type: "unstyled", text: "Read this source now.", entityRanges: [{ key: 0, offset: 10, length: 6 }], inlineStyleRanges: [{ offset: 0, length: 4, style: "Bold" }] },
      { type: "atomic", text: " ", entityRanges: [{ key: 1, offset: 0, length: 1 }] },
      { type: "unordered-list-item", text: "one", entityRanges: [], inlineStyleRanges: [] },
      { type: "unordered-list-item", text: "two", entityRanges: [], inlineStyleRanges: [] },
      { type: "ordered-list-item", text: "first", entityRanges: [], inlineStyleRanges: [] },
      { type: "blockquote", text: "quoted", entityRanges: [{ key: 3, offset: 0, length: 6 }], inlineStyleRanges: [] },
      { type: "atomic", text: " ", entityRanges: [{ key: 2, offset: 0, length: 1 }] },
      { type: "unstyled", text: "   ", entityRanges: [], inlineStyleRanges: [] },
    ],
  },
};

describe("parseXArticle", () => {
  it("maps Draft.js blocks, links, styles, media, dividers and cover", () => {
    const r = parseXArticle(article)!;
    expect(r.title).toBe("Long-form title");
    expect(r.cover).toBe("https://pbs.twimg.com/media/cover.jpg");
    expect(r.blocks).toEqual([
      { type: "heading", level: 2, text: "Intro" },
      { type: "paragraph", text: [{ text: "Read", bold: true }, { text: " this " }, { text: "source", href: "https://example.com/x" }, { text: " now." }] },
      { type: "figure", src: "https://pbs.twimg.com/media/fig.jpg", original_src: "https://pbs.twimg.com/media/fig.jpg", alt: "a chart", width: 1200, height: 800 },
      { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
      { type: "list", ordered: true, items: [[{ text: "first" }]] },
      { type: "quote", text: [{ text: "quoted" }] },
      { type: "divider" },
    ]);
  });
  it("returns null without content", () => {
    expect(parseXArticle({ title: "t" })).toBeNull();
    expect(parseXArticle(null)).toBeNull();
  });
});

describe("extractFromX with articles", () => {
  const fetcher = async (url: string) => {
    if (url === "https://api.fxtwitter.com/2/status/123") {
      return { url, status: 200, contentType: "application/json", body: Buffer.from(JSON.stringify({ code: 200, status: { author: { name: "Writer" }, article } })) };
    }
    throw new Error(`HTTP 404 ${url}`);
  };
  it("uses the attached article for a post link", async () => {
    const r = await extractFromX("https://x.com/writer/status/123?s=46", fetcher);
    expect(r?.title).toBe("Long-form title");
    expect(r?.blocks[0]).toEqual({ type: "heading", level: 2, text: "Intro" });
  });
  it("accepts /i/status/ links", async () => {
    expect((await extractFromX("https://x.com/i/status/123", fetcher))?.title).toBe("Long-form title");
  });
  it("explains that /i/article/ links need the post link instead", async () => {
    await expect(extractFromX("https://x.com/i/article/2108928845969780736", fetcher)).rejects.toThrow(ExtractError);
    await expect(extractFromX("https://x.com/i/article/2108928845969780736", fetcher)).rejects.toThrow(/게시물의 주소/);
  });
});
