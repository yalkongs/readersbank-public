import { describe, expect, it } from "vitest";
import { classifyInput, IngestBodySchema, isBlobUrl } from "@/lib/input";

describe("classifyInput", () => {
  it("classifies a plain url and strips the hash", () => {
    expect(classifyInput("  https://example.com/post?id=1#comments ")).toEqual({ type: "url", url: "https://example.com/post?id=1" });
  });
  it("notion url with query and hash", () => {
    expect(classifyInput("https://www.notion.so/team/Page-Title-1a2b3c?pvs=4#abc")).toEqual({
      type: "notion",
      url: "https://www.notion.so/team/Page-Title-1a2b3c?pvs=4",
    });
    expect(classifyInput("https://myspace.notion.site/Doc-123")).toEqual({ type: "notion", url: "https://myspace.notion.site/Doc-123" });
  });
  it("does not treat lookalike domains as notion", () => {
    expect(classifyInput("https://notnotion.so/x").type).toBe("url");
  });
  it("treats multi-line or non-url input as text", () => {
    expect(classifyInput("Hello\nhttps://example.com")).toEqual({ type: "text", text: "Hello\nhttps://example.com" });
    expect(classifyInput("ftp://example.com/file")).toEqual({ type: "text", text: "ftp://example.com/file" });
  });
});

describe("IngestBodySchema", () => {
  const file = { url: "https://abc.public.blob.vercel-storage.com/a.pdf", name: "a.pdf", contentType: "application/pdf" };
  it("accepts input only or file only", () => {
    expect(IngestBodySchema.safeParse({ input: "hello" }).success).toBe(true);
    expect(IngestBodySchema.safeParse({ file }).success).toBe(true);
  });
  it("rejects both or neither", () => {
    expect(IngestBodySchema.safeParse({ input: "hello", file }).success).toBe(false);
    expect(IngestBodySchema.safeParse({}).success).toBe(false);
    expect(IngestBodySchema.safeParse({ isPublic: true }).success).toBe(false);
  });
  it("rejects a file with a non-url", () => {
    expect(IngestBodySchema.safeParse({ file: { ...file, url: "nope" } }).success).toBe(false);
  });
});

describe("isBlobUrl", () => {
  it("requires https and a vercel blob host", () => {
    expect(isBlobUrl("http://a.public.blob.vercel-storage.com/x.pdf")).toBe(false);
    expect(isBlobUrl("https://example.com/x.pdf")).toBe(false);
    expect(isBlobUrl("https://a.public.blob.vercel-storage.com/x.pdf")).toBe(true);
    expect(isBlobUrl("not a url")).toBe(false);
  });
});
