import { describe, expect, it, vi } from "vitest";
import { decodeHtml, decodeText, extractFromFile, fileKind } from "./file";
import { ExtractError } from "./types";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const store = { put: vi.fn(async () => "https://x.blob.vercel-storage.com/i.png") };

describe("fileKind", () => {
  it.each([
    ["a.PDF", "", "pdf"],
    ["x.markdown", "", "md"],
    ["x.md", "", "md"],
    ["x.txt", "", "text"],
    ["x.htm", "", "html"],
    ["x.html", "", "html"],
    ["x.docx", "", "docx"],
    ["noext", DOCX, "docx"],
    ["noext", "application/pdf; charset=binary", "pdf"],
    ["x.exe", "application/octet-stream", null],
    ["noext", "", null],
  ])("%s / %s -> %s", (name, type, kind) => {
    expect(fileKind(name, type)).toBe(kind);
  });
});

describe("extractFromFile", () => {
  it("parses markdown and text", async () => {
    const { result } = await extractFromFile({ bytes: Buffer.from("# 제목\n\n본문입니다."), name: "a.md", contentType: "" }, { store });
    expect(result.title).toBe("제목");
    expect(result.blocks).toHaveLength(1);
  });

  it("parses html through readability", async () => {
    const html = `<html><head><title>Hello</title></head><body><article><h1>Hello</h1><p>${"Some long paragraph text here. ".repeat(20)}</p></article></body></html>`;
    const { result } = await extractFromFile({ bytes: Buffer.from(html), name: "a.html", contentType: "text/html" }, { store });
    expect(result.title).toBe("Hello");
    expect(result.blocks.some((b) => b.type === "paragraph")).toBe(true);
  });

  it("falls back to the whole body when readability finds nothing", async () => {
    const { result } = await extractFromFile({ bytes: Buffer.from("<p>짧은 글</p>"), name: "a.htm", contentType: "" }, { store });
    expect(result.blocks).toEqual([{ type: "paragraph", text: [{ text: "짧은 글" }] }]);
  });

  it("routes pdf through the llm and returns usage", async () => {
    const usage = { input: 1, output: 2, cacheRead: 0 };
    const llm = vi.fn(async () => ({ data: { title: "T", blocks: [{ type: "paragraph", text: [{ text: "본문" }] }] }, usage }));
    const out = await extractFromFile({ bytes: Buffer.from("%PDF"), name: "a.pdf", contentType: "" }, { store, llm: llm as never, countPages: async () => 1 });
    expect(llm).toHaveBeenCalledOnce();
    expect(out.usage).toEqual(usage);
    expect(out.result.title).toBe("T");
  });

  it("rejects unsupported formats", async () => {
    await expect(extractFromFile({ bytes: Buffer.from("x"), name: "a.exe", contentType: "" }, { store })).rejects.toThrow(ExtractError);
  });
});

describe("decodeText", () => {
  const EUC_KR_HANGUL = Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]); // "한글"
  it("decodes utf-8", () => expect(decodeText(Buffer.from("한글 text"))).toBe("한글 text"));
  it("falls back to euc-kr when bytes are not valid utf-8", () => expect(decodeText(EUC_KR_HANGUL)).toBe("한글"));
  it("parses an euc-kr text file", async () => {
    const { result } = await extractFromFile({ bytes: Buffer.concat([Buffer.from("# "), EUC_KR_HANGUL]), name: "a.txt", contentType: "" }, { store });
    expect(result.title).toBe("한글");
  });
});

describe("decodeHtml", () => {
  it("honors a meta charset", () => {
    const html = Buffer.concat([Buffer.from('<html><head><meta charset="windows-1252"></head><body>caf'), Buffer.from([0xe9]), Buffer.from("</body></html>")]);
    expect(decodeHtml(html)).toContain("café");
  });
  it("honors http-equiv content-type charset", () => {
    const html = Buffer.concat([
      Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=euc-kr"><p>'),
      Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]),
      Buffer.from("</p>"),
    ]);
    expect(decodeHtml(html)).toContain("<p>한글</p>");
  });
  it("ignores an unknown charset and falls back", () => {
    expect(decodeHtml(Buffer.from('<meta charset="x-bogus"><p>한글</p>'))).toContain("<p>한글</p>");
  });
});
