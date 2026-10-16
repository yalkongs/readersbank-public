import { describe, expect, it } from "vitest";
import { extractFromUrl } from "@/lib/extract/url";
import { ExtractError } from "@/lib/extract/types";

const para = "This is a long enough paragraph about an interesting topic. ".repeat(12);
const page = `<!doctype html><html><head><title>Doc Title</title><meta property="og:image" content="/cover.jpg"></head>
<body><nav>menu menu</nav><article><h1>Article Heading</h1><p>${para}</p>
<figure><img src="/fig1.png"><figcaption>Figure 1</figcaption></figure><p>${para}</p></article><footer>foot</footer></body></html>`;

function fetcher(body: string, contentType = "text/html; charset=utf-8") {
  return async (url: string) => ({ url, status: 200, contentType, body: Buffer.from(body) });
}

describe("extractFromUrl", () => {
  it("extracts article body, figure and og:image cover", async () => {
    const r = await extractFromUrl("https://site.com/post", fetcher(page));
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.coverImage).toBe("https://site.com/cover.jpg");
    expect(r.blocks.some((b) => b.type === "figure" && b.caption === "Figure 1" && b.src === "https://site.com/fig1.png")).toBe(true);
    expect(JSON.stringify(r.blocks)).not.toContain("menu menu");
  });
  it("rejects non-HTML responses", async () => {
    await expect(extractFromUrl("https://site.com/a.pdf", fetcher("%PDF", "application/pdf"))).rejects.toThrow(ExtractError);
  });
  it("decodes euc-kr pages", async () => {
    const encoded = Buffer.from(new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb])); // "한글" in EUC-KR
    const html = Buffer.concat([Buffer.from(`<html><head><title>t</title></head><body><article><p>`), encoded, Buffer.from(` ${para}</p></article></body></html>`)]);
    const r = await extractFromUrl("https://kr.site/", async (url) => ({ url, status: 200, contentType: "text/html; charset=euc-kr", body: html }));
    expect(JSON.stringify(r.blocks)).toContain("한글");
  });
});
