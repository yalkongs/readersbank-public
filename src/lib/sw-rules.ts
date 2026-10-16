// public/sw.js 가 이 규칙을 그대로 복제한다. 바꿀 때는 두 파일을 함께 고친다.
export type SwRequestLike = { method: string; url: string; mode?: string; destination?: string };
export type SwCacheKind = "document" | "image" | "static";

export function shouldCacheRequest(req: SwRequestLike, origin: string): SwCacheKind | null {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  if (url.origin !== origin) {
    if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") && req.destination === "image") return "image";
    return null;
  }
  const path = url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/.well-known")) return null;
  if (path.startsWith("/_next/static/")) return "static";
  if (path.startsWith("/icons/") || path === "/manifest.webmanifest" || path === "/theme-init.js" || path.endsWith(".woff2")) return "static";
  // 쿼리가 있는 문서(검색/태그 결과 /?q=, 비공개 듣기 링크 /read?t=)는 캐시하지 않는다. 문서 캐시 키는 쿼리 없는 경로다.
  if ((req.mode === "navigate" || req.destination === "document") && isCacheableDocumentPath(path) && url.search === "") return "document";
  return null;
}

// 오프라인 읽기용으로 저장할 수 있는 문서 경로: 홈(/)과 글(/a/<slug>...)뿐이다.
export function isCacheableDocumentPath(pathname: string): boolean {
  return pathname === "/" || (pathname.startsWith("/a/") && pathname.length > 3 && !/\/(opengraph|twitter)-image/.test(pathname));
}

export function isCacheableDocumentResponse(res: { ok: boolean; status: number; type: string; redirected: boolean }): boolean {
  return res.ok && res.status === 200 && res.type === "basic" && !res.redirected;
}

// 소유자만 보는 비공개 글 화면은 <meta name="rb-private">를 싣는다. 이런 응답은 저장하지 않는다(페이지는 응답 헤더를 못 바꾼다).
export function isPrivateDocumentHtml(html: string): boolean {
  return /<meta[^>]+name="rb-private"/.test(html);
}

const BLOB_SUFFIX = ".public.blob.vercel-storage.com";

// 공개 Blob 이미지에만 crossOrigin="anonymous"를 붙여 SW가 불투명하지 않은 응답을 캐시하게 한다.
export function isPublicBlobImage(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_SUFFIX);
  } catch {
    return false;
  }
}
