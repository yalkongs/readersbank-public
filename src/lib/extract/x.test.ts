import { describe, expect, it } from "vitest";
import { extractFromUrl } from "@/lib/extract/url";
import { extractFromX, parseSyndication, parseXStatusUrl, postTextToBlocks } from "@/lib/extract/x";

const TEXT = "Assorted things:\n\n• First point, long.\n\n• Second point https://example.com/a\ncontinued.\n\nClosing paragraph\nwith a soft break.";

const fx = {
  code: 200,
  tweet: {
    text: TEXT,
    author: { name: "Patrick Collison", screen_name: "patrickc" },
    media: { photos: [{ url: "https://pbs.twimg.com/media/a.jpg", width: 1200, height: 800, altText: "chart" }] },
    quote: { text: "Quoted\nline", author: { name: "Someone" } },
  },
};

function jsonFetcher(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    if (!hit) throw new Error(`HTTP 404 ${url}`);
    return { url, status: 200, contentType: "application/json", body: Buffer.from(JSON.stringify(hit[1])) };
  };
  return Object.assign(f, { calls });
}

describe("parseXStatusUrl", () => {
  it("accepts x.com / twitter.com status links with query strings", () => {
    expect(parseXStatusUrl("https://x.com/patrickc/status/2108706907859116280?s=46&t=abc")).toEqual({ user: "patrickc", id: "2108706907859116280" });
    expect(parseXStatusUrl("https://mobile.twitter.com/a_b/status/1/photo/1")).toEqual({ user: "a_b", id: "1" });
  });
  it("rejects other hosts and non-status paths", () => {
    expect(parseXStatusUrl("https://x.com.evil.com/a/status/1")).toBeNull();
    expect(parseXStatusUrl("https://x.com/patrickc")).toBeNull();
    expect(parseXStatusUrl("https://example.com/a/status/1")).toBeNull();
  });
});

describe("postTextToBlocks", () => {
  it("splits paragraphs on blank lines, turns • lines into one list, joins soft breaks, links urls", () => {
    expect(postTextToBlocks(TEXT)).toEqual([
      { type: "paragraph", text: [{ text: "Assorted things:" }] },
      {
        type: "list",
        ordered: false,
        items: [
          [{ text: "First point, long." }],
          [{ text: "Second point " }, { text: "https://example.com/a", href: "https://example.com/a" }, { text: " " }, { text: "continued." }],
        ],
      },
      { type: "paragraph", text: [{ text: "Closing paragraph with a soft break." }] },
    ]);
  });
});

describe("extractFromX", () => {
  it("uses fxtwitter: title from author + first line, photos as figures and cover, quote block", async () => {
    const f = jsonFetcher({ "https://api.fxtwitter.com/patrickc/status/123": fx });
    const r = await extractFromX("https://x.com/patrickc/status/123?s=46", f);
    expect(r?.title).toBe("Patrick Collison: Assorted things:");
    expect(r?.coverImage).toBe("https://pbs.twimg.com/media/a.jpg");
    expect(r?.blocks.at(-1)).toEqual({ type: "figure", src: "https://pbs.twimg.com/media/a.jpg", original_src: "https://pbs.twimg.com/media/a.jpg", caption: "chart", width: 1200, height: 800 });
    expect(r?.blocks.find((b) => b.type === "quote")).toEqual({ type: "quote", text: [{ text: "Someone: ", bold: true }, { text: "Quoted line" }] });
  });
  it("falls back to syndication for short posts when fxtwitter fails", async () => {
    const f = jsonFetcher({
      "https://cdn.syndication.twimg.com/tweet-result?id=123": {
        text: "Short post https://t.co/x https://t.co/m",
        user: { name: "A", screen_name: "a" },
        entities: { urls: [{ url: "https://t.co/x", expanded_url: "https://example.com/x" }], media: [{ url: "https://t.co/m" }] },
        mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/p.jpg", original_info: { width: 10, height: 20 } }],
      },
    });
    const r = await extractFromX("https://twitter.com/a/status/123", f);
    expect(f.calls[0]).toContain("api.fxtwitter.com");
    expect(r?.blocks[0]).toEqual({ type: "paragraph", text: [{ text: "Short post " }, { text: "https://example.com/x", href: "https://example.com/x" }] });
    expect(r?.coverImage).toBe("https://pbs.twimg.com/media/p.jpg");
  });
  it("ignores truncated long-post syndication data and returns null so HTML extraction runs", async () => {
    expect(parseSyndication({ text: "cut off", user: {}, note_tweet: { id: "n" } })).toBeNull();
    const f = jsonFetcher({ "https://cdn.syndication.twimg.com/": { text: "cut", user: {}, note_tweet: { id: "n" } } });
    expect(await extractFromX("https://x.com/a/status/1", f)).toBeNull();
  });
  it("leaves the cover empty when the post has no media (no profile picture)", async () => {
    const f = jsonFetcher({ "https://api.fxtwitter.com/": { tweet: { text: TEXT, author: { name: "P", screen_name: "p" } } } });
    expect((await extractFromX("https://x.com/p/status/1", f))?.coverImage).toBeNull();
  });
  it("is used by extractFromUrl for X links", async () => {
    const f = jsonFetcher({ "https://api.fxtwitter.com/": fx });
    const r = await extractFromUrl("https://x.com/patrickc/status/123", f);
    expect(r.blocks[1].type).toBe("list");
  });
});
