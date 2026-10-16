import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { BlockSchema, type Block } from "@/lib/blocks";
import { callJsonStreaming, LlmTruncatedError } from "@/lib/llm/client";
import type { ImageStore } from "@/lib/images/rehost";
import type { Usage } from "@/lib/articles/repo";
import { ExtractError, type ExtractResult } from "@/lib/extract/types";

const BlockSchemaWithoutFigure = z.discriminatedUnion(
  "type",
  BlockSchema.options.filter((o) => o.shape.type.value !== "figure" && o.shape.type.value !== "video") as unknown as [
    (typeof BlockSchema.options)[number],
    ...(typeof BlockSchema.options)[number][],
  ],
);

export const PdfExtractSchema = z.object({
  title: z.string(),
  blocks: z.array(
    z.union([
      BlockSchemaWithoutFigure,
      z.object({ type: z.literal("figure_ref"), page: z.number().int().min(1), caption: z.string().optional() }),
    ]),
  ),
});

export const PDF_SYSTEM =
  "PDF 본문을 읽는 순서대로 블록으로 옮긴다. 원문 언어 그대로(번역 금지). 머리글·바닥글·쪽번호·각주 번호 제외. 그림·도표·사진은 `figure_ref`로 쪽 번호(1부터)와 캡션을 적는다. 표는 table로. 제목은 문서 제목.";

export const MAX_PDF_FIGURE_PAGES = 20;
export const MAX_PDF_BYTES = 23 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

export type PageCounter = (pdf: Uint8Array) => Promise<number>;

export const unpdfPageCounter: PageCounter = async (pdf) => {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  try {
    return doc.numPages;
  } finally {
    await doc.loadingTask.destroy();
  }
};

export type PageRenderer = (pdf: Uint8Array, page: number) => Promise<Uint8Array>;

export const unpdfRenderer: PageRenderer = async (pdf, page) => {
  // pdf.js가 넘긴 버퍼를 detach하므로 매번 복사본을 전달한다.
  const out = await renderPageAsImage(new Uint8Array(pdf), page, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 1.5,
  });
  return new Uint8Array(out);
};

export async function extractFromPdf(
  bytes: Buffer,
  deps: { store: ImageStore; render?: PageRenderer; llm?: typeof callJsonStreaming; countPages?: PageCounter },
): Promise<{ result: ExtractResult; usage: Usage }> {
  const llm = deps.llm ?? callJsonStreaming;
  const render = deps.render ?? unpdfRenderer;
  const countPages = deps.countPages ?? unpdfPageCounter;

  if (bytes.length > MAX_PDF_BYTES) throw new ExtractError("PDF가 너무 큽니다. 23MB 이하로 줄이거나 나눠 올려 주세요.");
  let pages: number;
  try {
    pages = await countPages(new Uint8Array(bytes));
  } catch {
    throw new ExtractError("PDF를 열 수 없습니다. 암호가 걸려 있거나 손상된 파일인지 확인해 주세요.");
  }
  if (pages > MAX_PDF_PAGES) throw new ExtractError("PDF가 너무 깁니다(60쪽 초과). 부분으로 나눠 올려 주세요.");

  let out: Awaited<ReturnType<typeof callJsonStreaming<typeof PdfExtractSchema>>>;
  try {
    out = await llm({
      model: "main",
      system: PDF_SYSTEM,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
        { type: "text", text: "이 PDF를 블록으로 옮겨 주세요." },
      ],
      schema: PdfExtractSchema,
      effort: "medium",
    });
  } catch (e) {
    if (e instanceof LlmTruncatedError) {
      throw new ExtractError("PDF가 너무 길어 한 번에 처리하지 못했습니다. 부분으로 나눠 올려 주세요.");
    }
    if (e instanceof Anthropic.APIError && (e.status === 400 || e.status === 413)) {
      throw new ExtractError("PDF를 처리할 수 없습니다. 파일을 확인해 주세요.");
    }
    throw e;
  }

  // 페이지별 URL(실패 시 null) 캐시: 같은 페이지는 한 번만 렌더한다.
  const pageUrls = new Map<number, string | null>();
  const urlFor = async (page: number): Promise<string | null> => {
    if (pageUrls.has(page)) return pageUrls.get(page) ?? null;
    if (pageUrls.size >= MAX_PDF_FIGURE_PAGES) return null;
    let url: string | null = null;
    try {
      const png = await render(bytes, page);
      url = await deps.store.put(png, "image/png", `page-${page}.png`);
    } catch (e) {
      console.error("[pdf] render failed", { page, error: e instanceof Error ? e.message : String(e) });
      url = null;
    }
    pageUrls.set(page, url);
    return url;
  };

  const blocks: Block[] = [];
  let coverImage: string | null = null;
  for (const b of out.data.blocks) {
    if (b.type !== "figure_ref") {
      blocks.push(b as Block);
      continue;
    }
    const src = await urlFor(b.page);
    if (src) {
      blocks.push({ type: "figure", src, original_src: src, ...(b.caption ? { caption: b.caption } : {}) });
      coverImage ??= src;
    } else if (b.caption) {
      blocks.push({ type: "paragraph", text: [{ text: b.caption }] });
    }
  }

  return { result: { title: out.data.title, blocks, coverImage }, usage: out.usage };
}
