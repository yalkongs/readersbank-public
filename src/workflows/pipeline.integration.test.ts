import { beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

const store = vi.hoisted(() => ({ articles: new Map<string, Record<string, unknown>>(), tags: new Map<string, string[]>() }));

vi.mock("@/lib/articles/repo", () => ({
  requireArticle: vi.fn(async (id: string) => {
    const a = store.articles.get(id);
    if (!a) throw new (await import("@/lib/articles/admin-ops")).ArticleNotFoundError(id);
    return structuredClone(a);
  }),
  // 실제 UPDATE처럼 행이 없으면 아무것도 하지 않는다.
  updateArticle: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const a = store.articles.get(id);
    if (a) store.articles.set(id, { ...a, ...patch });
  }),
  recordUsage: vi.fn(async () => {}),
  listTagNames: vi.fn(async () => [] as string[]),
  setArticleTags: vi.fn(async (id: string, names: string[]) => {
    store.tags.set(id, names);
  }),
  getTagNames: vi.fn(async (id: string) => store.tags.get(id) ?? []),
}));
vi.mock("@/lib/extract/notion", () => ({ extractFromNotion: vi.fn() }));
vi.mock("@/lib/extract/file", () => ({ extractFromFile: vi.fn() }));
vi.mock("@/lib/blob/source-file", () => ({ readSourceFile: vi.fn() }));
vi.mock("@/lib/blob/image-store", () => ({ blobImageStore: vi.fn(() => ({ put: vi.fn() })) }));
vi.mock("@/lib/images/rehost", () => ({ rehostImages: vi.fn() }));
vi.mock("@/lib/llm/client", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/client")>()), callJson: vi.fn(), callWithWebSearch: vi.fn() }));

import * as repo from "@/lib/articles/repo";
import { blobImageStore } from "@/lib/blob/image-store";
import { readSourceFile } from "@/lib/blob/source-file";
import { extractFromFile } from "@/lib/extract/file";
import { extractFromNotion } from "@/lib/extract/notion";
import { rehostImages } from "@/lib/images/rehost";
import { callJson, callWithWebSearch } from "@/lib/llm/client";
import { SummarySchema } from "@/lib/summarize";
import { BriefSchema, TranslationSchema } from "@/lib/translate/prompts";
import { processArticle } from "@/workflows/process-article";

const usage = { input: 1, output: 1, cacheRead: 0 };

type StoredBlock = { type: string; src?: string; caption?: string; text?: unknown };
type StoredArticle = {
  status: string;
  currentStep: string | null;
  failedStep: string | null;
  error: string | null;
  lang: string;
  bodyOriginal: StoredBlock[];
  bodyKo: StoredBlock[];
  untranslated: unknown[];
  titleKo: string | null;
  titleOriginal: string | null;
  summaryKo: string[];
  searchText: string;
  relatedLinks?: unknown[] | null;
  coverImage: string | null;
};
const stored = (id: string) => store.articles.get(id) as unknown as StoredArticle;

const ENGLISH_DOC = `# How Good Ideas Spread

## The first idea

Good ideas rarely arrive fully formed. They start as a vague hunch that a curious person keeps turning over, and the people around them slowly notice that the hunch keeps producing useful results.

Over time those results accumulate, and what looked like a quirk becomes a method that other people can copy, adapt, and eventually improve upon in ways the original author never imagined.

![A diagram of idea spread](https://example.com/diagram.png)
`;

function seed(id: string, sourceText: string) {
  store.articles.set(id, {
    id,
    slug: "20261010-abcdef",
    sourceType: "text",
    sourceUrl: null,
    sourceText,
    bodyOriginal: null,
    bodyKo: null,
    publishedAt: null,
    status: "queued",
  });
}

function fakeCallJson(opts: { schema: unknown; user: string }) {
  if (opts.schema === BriefSchema) {
    return { data: { topic: "아이디어 확산", audience: "일반 독자", tone: "평서체", glossary: [] }, usage };
  }
  if (opts.schema === TranslationSchema) {
    const json = opts.user.slice(opts.user.indexOf("번역할 블록(JSON):\n") + "번역할 블록(JSON):\n".length);
    const items = JSON.parse(json) as { index: number; block: Record<string, unknown> }[];
    return { data: { items: items.map(({ index, block }) => ({ index, block: translateBlock(block) })) }, usage };
  }
  if (opts.schema === SummarySchema) {
    return {
      data: { title_ko: "좋은 아이디어는 어떻게 퍼지는가", lead_ko: "아이디어가 퍼지는 과정", summary: ["요점 하나", "요점 둘"], tags: ["아이디어", "글쓰기"] },
      usage,
    };
  }
  return { data: { lang: "en" }, usage };
}

function translateBlock(block: Record<string, unknown>): Record<string, unknown> {
  const prefix = (t: unknown) => `[ko] ${String(t)}`;
  if (block.type === "heading") return { ...block, text: prefix(block.text) };
  if (block.type === "paragraph") return { ...block, text: (block.text as { text: string }[]).map((s) => ({ ...s, text: prefix(s.text) })) };
  if (block.type === "figure") return { ...block, caption: prefix(block.caption) };
  return block;
}

beforeEach(() => {
  store.articles.clear();
  store.tags.clear();
  vi.mocked(callJson).mockReset();
  vi.mocked(callJson).mockImplementation((async (opts: { schema: unknown; user: string }) => fakeCallJson(opts)) as never);
  vi.mocked(callWithWebSearch).mockReset();
  vi.mocked(callWithWebSearch).mockResolvedValue({
    text: '{"items":[{"url":"https://other.example/post","title":"Other","titleKo":"다른 글","site":"Other","why":"이어 읽기"},{"url":"https://made-up.example/x","titleKo":"지어낸 글"}]}',
    searchedUrls: new Set(["https://other.example/post"]),
    usage: { input: 1, output: 1, cacheRead: 0 },
    searches: 1,
  });
  vi.mocked(repo.setArticleTags).mockClear();
  vi.mocked(repo.recordUsage).mockClear();
  vi.mocked(extractFromNotion).mockReset();
  vi.mocked(extractFromFile).mockReset();
  vi.mocked(readSourceFile).mockReset();
  vi.mocked(rehostImages).mockReset();
  vi.mocked(rehostImages).mockImplementation((async (blocks: unknown[]) => ({ blocks, cover: null })) as never);
  vi.mocked(blobImageStore).mockClear();
});

const LONG = "A fairly long paragraph of prose that carries enough characters to pass the minimum size check for extracted content. ".repeat(3);
const para = (t: string) => ({ type: "paragraph" as const, text: [{ text: t }] });

describe("processArticle through real step bodies", () => {
  it("still publishes when finding related links fails", async () => {
    seed("r1", ENGLISH_DOC);
    vi.mocked(callWithWebSearch).mockRejectedValue(new Error("search down"));
    await expect(processArticle("r1")).resolves.toEqual({ status: "published" });
    expect(stored("r1").status).toBe("published");
    expect(stored("r1").relatedLinks ?? null).toBeNull();
  });

  it("extracts, translates, summarizes and publishes an english text article", async () => {
    seed("a1", ENGLISH_DOC);
    await expect(processArticle("a1")).resolves.toEqual({ status: "published" });

    const a = stored("a1");
    expect(a.status).toBe("published");
    expect(a.currentStep).toBeNull();
    expect(a.failedStep).toBeNull();
    expect(a.lang).toBe("en");
    expect(a.bodyOriginal.length).toBeGreaterThanOrEqual(4);
    expect(a.bodyKo).toHaveLength(a.bodyOriginal.length);
    expect(a.untranslated).toEqual([]);
    const koTexts = a.bodyKo.flatMap((b): string[] =>
      b.type === "paragraph"
        ? (b.text as { text: string }[]).map((s) => s.text)
        : b.type === "heading"
          ? [b.text as string]
          : b.type === "figure"
            ? [b.caption ?? ""]
            : [],
    );
    expect(koTexts.length).toBeGreaterThanOrEqual(4);
    for (const t of koTexts) expect(t.startsWith("[ko]")).toBe(true);
    const fig = a.bodyKo.find((b) => b.type === "figure");
    expect(fig?.src).toBe("https://example.com/diagram.png");
    expect(fig?.caption).toBe("[ko] A diagram of idea spread");
    expect(a.titleKo).toBe("좋은 아이디어는 어떻게 퍼지는가");
    expect(a.summaryKo.length).toBeGreaterThan(0);
    expect(a.searchText).toContain(a.titleKo!);
    // 발행 뒤 웹 검색 추천: 검색 결과에 없던(지어낸) 주소는 버린다.
    expect(a.relatedLinks).toEqual([{ url: "https://other.example/post", title: "Other", titleKo: "다른 글", site: "Other", why: "이어 읽기" }]);
    expect(repo.setArticleTags).toHaveBeenCalledWith("a1", ["아이디어", "글쓰기"]);
  });

  it("marks the article failed at the extract step when the text is too short", async () => {
    seed("a2", "Too short.");
    await expect(processArticle("a2")).rejects.toThrow();

    const a = stored("a2");
    expect(a.status).toBe("failed");
    expect(a.failedStep).toBe("extract");
    expect(a.error).toMatch(/[가-힣]/);
  });

  it("fill mode translates only the missing blocks of a published article and keeps the rest", async () => {
    seed("fill1", ENGLISH_DOC);
    await processArticle("fill1");
    const a = stored("fill1");
    const missingIdx = a.bodyKo.findIndex((b) => b.type === "paragraph");
    // 누락이 생긴 상태를 흉내 낸다: 한 문단을 원문으로 되돌리고 누락으로 표시
    a.bodyKo[missingIdx] = a.bodyOriginal[missingIdx];
    a.untranslated = [missingIdx];
    const keep = JSON.stringify(a.bodyKo.filter((_, i) => i !== missingIdx));
    vi.mocked(callJson).mockClear();
    await expect(processArticle("fill1", "fill")).resolves.toEqual({ status: "published" });
    const b = stored("fill1");
    expect(b.untranslated).toEqual([]);
    expect(JSON.stringify(b.bodyKo[missingIdx])).toContain("[ko]");
    expect(JSON.stringify(b.bodyKo.filter((_, i) => i !== missingIdx))).toBe(keep);
  });

  it("accepts a short pasted text that a web page would be rejected for", async () => {
    seed("a3", "짧지만 일부러 붙여넣은 메모입니다. 스무 자는 넘습니다.");
    await expect(processArticle("a3")).resolves.toEqual({ status: "published" });
  });

  it("rehosts images of a notion source and stores the rehosted blocks and cover", async () => {
    store.articles.set("n1", { id: "n1", slug: "20261010-notion", sourceType: "notion", sourceUrl: "https://www.notion.so/Page-abc", sourceText: null, bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    const fig = { type: "figure" as const, src: "https://notion.example/img.png", original_src: "https://notion.example/img.png" };
    vi.mocked(extractFromNotion).mockResolvedValue({ title: "Notion Doc", blocks: [para(LONG), fig], coverImage: "https://notion.example/img.png" });
    const hosted = { ...fig, src: "https://x.public.blob.vercel-storage.com/1.png" };
    vi.mocked(rehostImages).mockResolvedValue({ blocks: [para(LONG), hosted], cover: hosted.src });

    await expect(processArticle("n1")).resolves.toEqual({ status: "published" });

    expect(extractFromNotion).toHaveBeenCalledWith("https://www.notion.so/Page-abc");
    expect(rehostImages).toHaveBeenCalledOnce();
    expect(blobImageStore).toHaveBeenCalledWith("n1");
    const a = stored("n1");
    expect(a.bodyOriginal[1].src).toBe(hosted.src);
    expect(a.coverImage).toBe(hosted.src);
    expect(a.titleOriginal).toBe("Notion Doc");
  });

  it("extracts an uploaded file without rehosting and records pdf usage", async () => {
    store.articles.set("f1", { id: "f1", slug: "20261010-file", sourceType: "pdf", sourceUrl: null, sourceText: null, sourceFileBlob: "https://x.public.blob.vercel-storage.com/a.pdf", sourceFileName: "a.pdf", sourceFileType: "application/pdf", bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    vi.mocked(readSourceFile).mockResolvedValue({ bytes: Buffer.from("%PDF"), contentType: "application/pdf" });
    vi.mocked(extractFromFile).mockResolvedValue({ result: { title: "PDF Doc", blocks: [para(LONG)], coverImage: "https://x.public.blob.vercel-storage.com/c.png" }, usage });

    await expect(processArticle("f1")).resolves.toEqual({ status: "published" });

    expect(readSourceFile).toHaveBeenCalledWith("https://x.public.blob.vercel-storage.com/a.pdf");
    expect(vi.mocked(extractFromFile).mock.calls[0][0]).toMatchObject({ name: "a.pdf", contentType: "application/pdf" });
    expect(rehostImages).not.toHaveBeenCalled();
    expect(repo.recordUsage).toHaveBeenCalledWith("f1", "extract_pdf", usage);
    const a = stored("f1");
    expect(a.coverImage).toBe("https://x.public.blob.vercel-storage.com/c.png");
  });

  it("rehosts images of an uploaded md file (sourceType text with a blob file)", async () => {
    store.articles.set("m1", { id: "m1", slug: "20261010-md", sourceType: "text", sourceUrl: null, sourceText: null, sourceFileBlob: "https://x.public.blob.vercel-storage.com/a.md", sourceFileName: "a.md", sourceFileType: "text/markdown", bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    vi.mocked(readSourceFile).mockResolvedValue({ bytes: Buffer.from("md"), contentType: "text/markdown" });
    const fig = { type: "figure" as const, src: "https://ext.example/p.png", original_src: "https://ext.example/p.png" };
    vi.mocked(extractFromFile).mockResolvedValue({ result: { title: "MD", blocks: [para(LONG), fig], coverImage: fig.src } });
    const hosted = { ...fig, src: "https://x.public.blob.vercel-storage.com/1.png" };
    vi.mocked(rehostImages).mockResolvedValue({ blocks: [para(LONG), hosted], cover: hosted.src });

    await processArticle("m1");

    expect(rehostImages).toHaveBeenCalledOnce();
    const a = stored("m1");
    expect(a.bodyOriginal[1].src).toBe(hosted.src);
    expect(a.coverImage).toBe(hosted.src);
  });

  it("rehosts an external cover image of a url source that has no figures", async () => {
    store.articles.set("c1", { id: "c1", slug: "20261010-cover", sourceType: "notion", sourceUrl: "https://www.notion.so/Page-abc", sourceText: null, bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    vi.mocked(extractFromNotion).mockResolvedValue({ title: "Cover Doc", blocks: [para(LONG)], coverImage: "https://ext.example/cover.jpg" });
    const hostedCover = "https://x.public.blob.vercel-storage.com/1.jpg";
    vi.mocked(rehostImages).mockImplementation((async (blocks: { type: string; src?: string }[]) =>
      blocks.some((b) => b.type === "figure")
        ? { blocks: blocks.map((b) => (b.type === "figure" ? { ...b, src: hostedCover } : b)), cover: hostedCover }
        : { blocks, cover: null }) as never);

    await expect(processArticle("c1")).resolves.toEqual({ status: "published" });

    expect(rehostImages).toHaveBeenCalledTimes(2);
    expect(vi.mocked(rehostImages).mock.calls[1][0]).toEqual([{ type: "figure", src: "https://ext.example/cover.jpg" }]);
    const a = stored("c1");
    expect(a.coverImage).toBe(hostedCover);
  });

  it("stores no cover when rehosting the external cover fails", async () => {
    store.articles.set("c2", { id: "c2", slug: "20261010-cover2", sourceType: "notion", sourceUrl: "https://www.notion.so/Page-abc", sourceText: null, bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    vi.mocked(extractFromNotion).mockResolvedValue({ title: "Cover Doc", blocks: [para(LONG)], coverImage: "https://ext.example/cover.jpg" });

    await expect(processArticle("c2")).resolves.toEqual({ status: "published" });

    expect(rehostImages).toHaveBeenCalledTimes(2);
    const a = stored("c2");
    expect(a.coverImage).toBeNull();
  });

  it("does not rehost a cover that is already a blob url", async () => {
    store.articles.set("c3", { id: "c3", slug: "20261010-cover3", sourceType: "notion", sourceUrl: "https://www.notion.so/Page-abc", sourceText: null, bodyOriginal: null, bodyKo: null, publishedAt: null, status: "queued" });
    const blobCover = "https://x.public.blob.vercel-storage.com/c.png";
    vi.mocked(extractFromNotion).mockResolvedValue({ title: "Cover Doc", blocks: [para(LONG)], coverImage: blobCover });

    await processArticle("c3");

    expect(rehostImages).toHaveBeenCalledOnce();
    expect((stored("c3")).coverImage).toBe(blobCover);
  });

  it("stops with a FatalError (no retries) when the article row is missing", async () => {
    const err = await processArticle("gone").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FatalError);
    expect((err as Error).message).toBe("글이 삭제되었습니다");
    expect(store.articles.has("gone")).toBe(false);
  });

  it("stops with a FatalError when the article is deleted mid-pipeline", async () => {
    seed("d1", ENGLISH_DOC);
    vi.mocked(callJson).mockImplementation((async (opts: { schema: unknown; user: string }) => {
      if (opts.schema === SummarySchema) store.articles.delete("d1");
      return fakeCallJson(opts);
    }) as never);
    const err = await processArticle("d1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FatalError);
    expect((err as Error).message).toBe("글이 삭제되었습니다");
    expect(store.articles.has("d1")).toBe(false);
  });

  const schemasCalled = () => vi.mocked(callJson).mock.calls.map((c) => (c[0] as { schema: unknown }).schema);
  const seedEnglishExtracted = (id: string, bodyKo: unknown) => {
    const bodyOriginal = [para(LONG)];
    store.articles.set(id, {
      id, slug: `20261010-${id}`, sourceType: "text", sourceUrl: null, sourceText: LONG, titleOriginal: "Doc",
      bodyOriginal, bodyKo, untranslated: [], lang: "en", publishedAt: null, status: "queued",
    });
  };

  it("resume keeps an existing translation: no brief or translate calls", async () => {
    const bodyKo = [para("이미 번역된 본문")];
    seedEnglishExtracted("r1", bodyKo);
    await expect(processArticle("r1")).resolves.toEqual({ status: "published" });
    const schemas = schemasCalled();
    expect(schemas).not.toContain(BriefSchema);
    expect(schemas).not.toContain(TranslationSchema);
    expect(schemas).toContain(SummarySchema);
    expect(stored("r1").bodyKo).toEqual(bodyKo);
  });

  it("retranslate (bodyKo cleared) runs brief and translation again", async () => {
    seedEnglishExtracted("r2", null);
    await expect(processArticle("r2")).resolves.toEqual({ status: "published" });
    const schemas = schemasCalled();
    expect(schemas).toContain(BriefSchema);
    expect(schemas).toContain(TranslationSchema);
    expect(stored("r2").bodyKo).toHaveLength(1);
  });
});
