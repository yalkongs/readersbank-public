import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmTruncatedError } from "@/lib/llm/client";
import { ExtractError } from "@/lib/extract/types";
import { extractFromPdf, PdfExtractSchema, unpdfPageCounter } from "@/lib/extract/pdf";
import type { ImageStore } from "@/lib/images/rehost";

const usage = { input: 1, output: 1, cacheRead: 0 };
const countPages = async () => 3;
const store = (): ImageStore & { names: string[] } => {
  const names: string[] = [];
  return { names, async put(_b, _ct, name) { names.push(name); return `https://blob.example/${name}`; } };
};

describe("extractFromPdf", () => {
  afterEach(() => vi.restoreAllMocks());
  it("renders each referenced page once and builds figures", async () => {
    const s = store();
    const render = vi.fn(async () => new Uint8Array([1]));
    const llm = vi.fn(async () => ({
      data: {
        title: "Paper",
        blocks: [
          { type: "heading", level: 2, text: "Intro" },
          { type: "figure_ref", page: 2, caption: "Figure 1" },
          { type: "paragraph", text: [{ text: "Body" }] },
          { type: "figure_ref", page: 2, caption: "Figure 2" },
          { type: "figure_ref", page: 5 },
        ],
      },
      usage,
    }));
    const { result } = await extractFromPdf(Buffer.from("%PDF"), { store: s, render, llm: llm as never, countPages });
    expect(render).toHaveBeenCalledTimes(2);
    expect(s.names).toEqual(["page-2.png", "page-5.png"]);
    expect(result.title).toBe("Paper");
    expect(result.blocks).toEqual([
      { type: "heading", level: 2, text: "Intro" },
      { type: "figure", src: "https://blob.example/page-2.png", original_src: "https://blob.example/page-2.png", caption: "Figure 1" },
      { type: "paragraph", text: [{ text: "Body" }] },
      { type: "figure", src: "https://blob.example/page-2.png", original_src: "https://blob.example/page-2.png", caption: "Figure 2" },
      { type: "figure", src: "https://blob.example/page-5.png", original_src: "https://blob.example/page-5.png" },
    ]);
    expect(result.coverImage).toBe("https://blob.example/page-2.png");
  });

  it("falls back to caption paragraph when rendering fails", async () => {
    const llm = vi.fn(async () => ({ data: { title: "T", blocks: [{ type: "figure_ref", page: 1, caption: "Cap" }, { type: "figure_ref", page: 3 }] }, usage }));
    const render = vi.fn(async () => { throw new Error("canvas"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await extractFromPdf(Buffer.from("%PDF"), { store: store(), render, llm: llm as never, countPages });
    expect(result.blocks).toEqual([{ type: "paragraph", text: [{ text: "Cap" }] }]);
  });

  it("maps truncation to a Korean ExtractError", async () => {
    const llm = vi.fn(async () => { throw new LlmTruncatedError("x"); });
    await expect(extractFromPdf(Buffer.from("%PDF"), { store: store(), render: vi.fn(), llm: llm as never, countPages })).rejects.toThrow(ExtractError);
  });

  it("caps distinct rendered pages at 20", async () => {
    const refs = Array.from({ length: 22 }, (_, i) => ({ type: "figure_ref", page: i + 1, caption: `F${i + 1}` }));
    const llm = vi.fn(async () => ({ data: { title: "T", blocks: refs }, usage }));
    const render = vi.fn(async () => new Uint8Array([1]));
    const { result } = await extractFromPdf(Buffer.from("%PDF"), { store: store(), render, llm: llm as never, countPages });
    expect(render).toHaveBeenCalledTimes(20);
    expect(result.blocks.filter((b) => b.type === "figure")).toHaveLength(20);
    expect(result.blocks.slice(20)).toEqual([
      { type: "paragraph", text: [{ text: "F21" }] },
      { type: "paragraph", text: [{ text: "F22" }] },
    ]);
  });
});

describe("extractFromPdf prechecks", () => {
  afterEach(() => vi.restoreAllMocks());
  const okLlm = () => vi.fn(async () => ({ data: { title: "T", blocks: [] }, usage }));

  it("rejects PDFs over 23MB before calling the llm", async () => {
    const llm = okLlm();
    const bytes = Buffer.alloc(23 * 1024 * 1024 + 1);
    await expect(extractFromPdf(bytes, { store: store(), llm: llm as never, countPages })).rejects.toThrow("PDF가 너무 큽니다");
    expect(llm).not.toHaveBeenCalled();
  });

  it("rejects PDFs over 60 pages", async () => {
    const llm = okLlm();
    const err = await extractFromPdf(Buffer.from("%PDF"), { store: store(), llm: llm as never, countPages: async () => 61 }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err.message).toContain("60쪽 초과");
    expect(llm).not.toHaveBeenCalled();
  });

  it("maps an unreadable PDF to a Korean ExtractError", async () => {
    const llm = okLlm();
    const err = await extractFromPdf(Buffer.from("%PDF"), {
      store: store(),
      llm: llm as never,
      countPages: async () => {
        throw new Error("PasswordException");
      },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err.message).toContain("PDF를 열 수 없습니다");
    expect(llm).not.toHaveBeenCalled();
  });

  it("counts pages of a real (invalid) PDF with unpdf by default and reports it as unreadable", async () => {
    const llm = okLlm();
    await expect(extractFromPdf(Buffer.from("not a pdf"), { store: store(), llm: llm as never })).rejects.toThrow("PDF를 열 수 없습니다");
  });

  it.each([400, 413])("maps API status %i to a Korean ExtractError", async (status) => {
    const llm = vi.fn(async () => {
      throw Anthropic.APIError.generate(status, { error: { message: "bad" } }, "bad", new Headers());
    });
    const err = await extractFromPdf(Buffer.from("%PDF"), { store: store(), llm: llm as never, countPages }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err.message).toBe("PDF를 처리할 수 없습니다. 파일을 확인해 주세요.");
  });

  it("rethrows other API errors unchanged", async () => {
    const apiErr = Anthropic.APIError.generate(500, { error: { message: "boom" } }, "boom", new Headers());
    const llm = vi.fn(async () => {
      throw apiErr;
    });
    await expect(extractFromPdf(Buffer.from("%PDF"), { store: store(), llm: llm as never, countPages })).rejects.toBe(apiErr);
  });

  it("logs render failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const llm = vi.fn(async () => ({ data: { title: "T", blocks: [{ type: "figure_ref", page: 4, caption: "Cap" }] }, usage }));
    const render = vi.fn(async () => {
      throw new Error("canvas");
    });
    await extractFromPdf(Buffer.from("%PDF"), { store: store(), render, llm: llm as never, countPages });
    expect(spy).toHaveBeenCalledWith("[pdf] render failed", { page: 4, error: "canvas" });
  });

  it("requires figure_ref pages to be at least 1", () => {
    expect(PdfExtractSchema.safeParse({ title: "T", blocks: [{ type: "figure_ref", page: 0 }] }).success).toBe(false);
  });
});

describe("unpdfPageCounter", () => {
  it("counts pages of a minimal PDF", async () => {
    const pdf = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj",
      "4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj",
      "trailer << /Root 1 0 R >>",
      "%%EOF",
    ].join("\n");
    await expect(unpdfPageCounter(new TextEncoder().encode(pdf))).resolves.toBe(2);
  });
});
