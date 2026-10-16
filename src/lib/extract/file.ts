import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { Usage } from "@/lib/articles/repo";
import type { ImageStore } from "@/lib/images/rehost";
import type { callJsonStreaming } from "@/lib/llm/client";
import { extractFromDocx } from "./docx";
import { fileKind, type FileKind } from "./file-kind";
import { htmlToBlocks } from "./html-to-blocks";
import { extractFromPdf, type PageCounter, type PageRenderer } from "./pdf";
import { extractFromText } from "./text";
import { ExtractError, type ExtractResult } from "./types";

export { fileKind, type FileKind };

const UNSUPPORTED = "지원하지 않는 파일 형식입니다. txt, md, html, docx, pdf만 올릴 수 있습니다.";

// UTF-8이 아니면 국내 문서에 흔한 EUC-KR(CP949)로 읽는다.
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

// <meta charset> 또는 http-equiv의 charset을 앞 2KB에서 찾아 그 인코딩으로 읽는다.
export function decodeHtml(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i)?.[1];
  if (charset) {
    try {
      const decoder = new TextDecoder(charset);
      if (decoder.encoding !== "utf-8") return decoder.decode(bytes);
    } catch {
      // 모르는 charset이면 기본 규칙으로 읽는다.
    }
  }
  return decodeText(bytes);
}

function extractFromHtmlFile(html: string): ExtractResult {
  const doc = new JSDOM(html).window.document;
  const pageTitle = doc.title.trim();
  let title = pageTitle;
  let blocks = [] as ReturnType<typeof htmlToBlocks>;
  try {
    const article = new Readability(new JSDOM(html).window.document).parse();
    if (article?.content) {
      blocks = htmlToBlocks(article.content);
      title = article.title?.trim() || pageTitle;
    }
  } catch {
    blocks = [];
  }
  if (blocks.length === 0) blocks = htmlToBlocks(doc.body?.innerHTML ?? "");
  const firstFigure = blocks.find((b) => b.type === "figure");
  return { title: title || "제목 없음", blocks, coverImage: firstFigure?.type === "figure" ? firstFigure.src : null };
}

export async function extractFromFile(
  input: { bytes: Buffer; name: string; contentType: string },
  deps: { store: ImageStore; llm?: typeof callJsonStreaming; render?: PageRenderer; countPages?: PageCounter },
): Promise<{ result: ExtractResult; usage?: Usage }> {
  switch (fileKind(input.name, input.contentType)) {
    case "text":
    case "md":
      return { result: extractFromText(decodeText(input.bytes)) };
    case "html":
      return { result: extractFromHtmlFile(decodeHtml(input.bytes)) };
    case "docx":
      return { result: await extractFromDocx(input.bytes, deps.store) };
    case "pdf":
      return extractFromPdf(input.bytes, deps);
    default:
      throw new ExtractError(UNSUPPORTED);
  }
}
