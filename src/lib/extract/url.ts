import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { safeHref } from "@/lib/blocks";
import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { htmlToBlocks } from "./html-to-blocks";
import { extractFromX } from "./x";
import { ExtractError, type ExtractResult } from "./types";

type Fetcher = (url: string, opts: { maxBytes: number }) => Promise<SafeFetchResult>;

const MAX_HTML_BYTES = 10 * 1024 * 1024;

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export async function extractFromUrl(url: string, fetcher: Fetcher = safeFetch): Promise<ExtractResult> {
  const post = await extractFromX(url, fetcher);
  if (post) return post;
  const res = await fetcher(url, { maxBytes: MAX_HTML_BYTES });
  const type = res.contentType.toLowerCase();
  if (!type.includes("text/html") && !type.includes("application/xhtml")) {
    throw new ExtractError("웹 페이지(HTML)가 아닙니다. PDF나 문서 파일은 파일로 업로드해 주세요.");
  }
  const dom = new JSDOM(decode(res.body, res.contentType), { url: res.url });
  const doc = dom.window.document;
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
  const pageTitle = doc.title;
  const article = new Readability(doc).parse();
  if (!article?.content) throw new ExtractError("본문을 가져오지 못했습니다. 텍스트로 붙여넣어 주세요.");

  const blocks = htmlToBlocks(article.content, res.url);
  let cover: string | null = null;
  if (ogImage) {
    try {
      cover = safeHref(new URL(ogImage, res.url).toString()) ?? null;
    } catch {
      cover = null;
    }
  }
  const firstFigure = blocks.find((b) => b.type === "figure");
  return {
    title: article.title?.trim() || pageTitle || url,
    blocks,
    coverImage: cover ?? (firstFigure?.type === "figure" ? firstFigure.src : null),
  };
}
