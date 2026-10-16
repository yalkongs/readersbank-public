import { describe, expect, it } from "vitest";
import { isCacheableDocumentPath, isPrivateDocumentHtml, isCacheableDocumentResponse, isPublicBlobImage, shouldCacheRequest } from "@/lib/sw-rules";

const origin = "https://readersbank.example";
const nav = (path: string, method = "GET") => ({ method, url: origin + path, mode: "navigate", destination: "document" });

describe("shouldCacheRequest", () => {
  it("never caches admin, api, well-known", () => {
    expect(shouldCacheRequest(nav("/admin"), origin)).toBeNull();
    expect(shouldCacheRequest(nav("/admin/login"), origin)).toBeNull();
    expect(shouldCacheRequest({ method: "GET", url: origin + "/api/articles" }, origin)).toBeNull();
    expect(shouldCacheRequest({ method: "GET", url: origin + "/.well-known/workflow/v1/flow" }, origin)).toBeNull();
  });
  it("never caches non-GET", () => {
    expect(shouldCacheRequest(nav("/", "POST"), origin)).toBeNull();
  });
  it("caches reading documents", () => {
    expect(shouldCacheRequest(nav("/"), origin)).toBe("document");
    expect(shouldCacheRequest(nav("/a/x"), origin)).toBe("document");
    expect(shouldCacheRequest(nav("/a/x/read"), origin)).toBe("document");
  });
  it("does not cache documents with a query (private listen links, search)", () => {
    expect(shouldCacheRequest(nav("/a/x/read?t=abc"), origin)).toBeNull();
    expect(shouldCacheRequest(nav("/a/x?utm=1"), origin)).toBeNull();
    expect(shouldCacheRequest(nav("/?q=a"), origin)).toBeNull();
  });
  it("does not cache other documents", () => {
    expect(shouldCacheRequest(nav("/whatever"), origin)).toBeNull();
  });
  it("caches static assets", () => {
    expect(shouldCacheRequest({ method: "GET", url: origin + "/_next/static/chunk.js" }, origin)).toBe("static");
    expect(shouldCacheRequest({ method: "GET", url: origin + "/icons/a.png" }, origin)).toBe("static");
    expect(shouldCacheRequest({ method: "GET", url: origin + "/manifest.webmanifest" }, origin)).toBe("static");
    expect(shouldCacheRequest({ method: "GET", url: origin + "/f/x.woff2" }, origin)).toBe("static");
    expect(shouldCacheRequest({ method: "GET", url: origin + "/theme-init.js" }, origin)).toBe("static");
  });
  it("caches only public Blob images cross-origin", () => {
    const blob = "https://abc123.public.blob.vercel-storage.com/img/a.webp";
    expect(shouldCacheRequest({ method: "GET", url: blob, destination: "image" }, origin)).toBe("image");
    expect(shouldCacheRequest({ method: "GET", url: blob, destination: "script" }, origin)).toBeNull();
    expect(shouldCacheRequest({ method: "GET", url: "https://evil.example/a.png", destination: "image" }, origin)).toBeNull();
    expect(shouldCacheRequest({ method: "GET", url: "https://evilpublic.blob.vercel-storage.com/a.png", destination: "image" }, origin)).toBeNull();
    expect(shouldCacheRequest({ method: "GET", url: "https://x.example/_next/static/a.js" }, origin)).toBeNull();
  });
});

describe("edge cases", () => {
  it("rejects http Blob URL, normalized admin path, bare /a", () => {
    expect(shouldCacheRequest({ method: "GET", url: "http://abc.public.blob.vercel-storage.com/a.webp", destination: "image" }, origin)).toBeNull();
    expect(shouldCacheRequest(nav("/a/../admin"), origin)).toBeNull();
    expect(shouldCacheRequest(nav("/a"), origin)).toBeNull();
  });
});

describe("search and tag pages", () => {
  it("does not cache the home page with a query string", () => {
    expect(shouldCacheRequest(nav("/?q=x"), origin)).toBeNull();
    expect(shouldCacheRequest(nav("/?tag=y"), origin)).toBeNull();
  });
});

describe("isCacheableDocumentPath", () => {
  it("accepts home and article paths", () => {
    expect(isCacheableDocumentPath("/")).toBe(true);
    expect(isCacheableDocumentPath("/a/some-slug")).toBe(true);
    expect(isCacheableDocumentPath("/a/some-slug/read")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isCacheableDocumentPath("/admin")).toBe(false);
    expect(isCacheableDocumentPath("/api/x")).toBe(false);
    expect(isCacheableDocumentPath("/a")).toBe(false);
    expect(isCacheableDocumentPath("/a/")).toBe(false);
    expect(isCacheableDocumentPath("/whatever")).toBe(false);
    expect(isCacheableDocumentPath("")).toBe(false);
    expect(isCacheableDocumentPath("/a/some-slug/opengraph-image-okhrg/portrait")).toBe(false);
    expect(isCacheableDocumentPath("/a/some-slug/twitter-image-okhrg")).toBe(false);
  });
});

describe("isPublicBlobImage", () => {
  it("accepts https public Blob hosts only", () => {
    expect(isPublicBlobImage("https://abc.public.blob.vercel-storage.com/x.webp")).toBe(true);
    expect(isPublicBlobImage("http://abc.public.blob.vercel-storage.com/x.webp")).toBe(false);
    expect(isPublicBlobImage("https://evilpublic.blob.vercel-storage.com/x.webp")).toBe(false);
    expect(isPublicBlobImage("https://example.com/x.webp")).toBe(false);
    expect(isPublicBlobImage("/relative.png")).toBe(false);
    expect(isPublicBlobImage("not a url")).toBe(false);
  });
});

describe("isCacheableDocumentResponse", () => {
  const r = (o: Partial<{ ok: boolean; status: number; type: string; redirected: boolean }> = {}) => ({
    ok: true, status: 200, type: "basic", redirected: false, ...o,
  });
  it("accepts 200 basic responses regardless of Cache-Control", () => {
    expect(isCacheableDocumentResponse(r())).toBe(true);
  });
  it("rejects redirected, non-200, opaque, non-ok", () => {
    expect(isCacheableDocumentResponse(r({ redirected: true }))).toBe(false);
    expect(isCacheableDocumentResponse(r({ status: 404, ok: false }))).toBe(false);
    expect(isCacheableDocumentResponse(r({ status: 206 }))).toBe(false);
    expect(isCacheableDocumentResponse(r({ type: "opaque" }))).toBe(false);
    expect(isCacheableDocumentResponse(r({ type: "cors" }))).toBe(false);
    expect(isCacheableDocumentResponse(r({ ok: false }))).toBe(false);
  });
});

describe("isPrivateDocumentHtml", () => {
  it("detects the owner-only private marker", () => {
    expect(isPrivateDocumentHtml('<head><meta name="rb-private" content="1"/></head>')).toBe(true);
    expect(isPrivateDocumentHtml('<head><meta name="robots" content="noindex"/></head>')).toBe(false);
  });
});
