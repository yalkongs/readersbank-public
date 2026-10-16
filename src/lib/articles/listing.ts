// src/lib/articles/listing.ts — 목록 쿼리용 순수 헬퍼
export const PAGE_SIZE = 18;
export const MAX_QUERY = 100;

export type ListParams = { q?: string | null; tag?: string | null; cursor?: string | null };

export type ArticleCardData = {
  slug: string;
  titleKo: string | null;
  titleOriginal: string | null;
  leadKo: string | null;
  // 요약 첫 문장. 표지 이미지가 없을 때 인용 표지로 쓴다.
  quoteKo: string | null;
  coverImage: string | null;
  coverGenerated: boolean;
  lang: string | null;
  sourceUrl: string | null;
  publishedAt: Date | null;
  id: string;
};

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([publishedAt.toISOString(), id])).toString("base64url");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export function decodeCursor(s: string | null | undefined): { publishedAt: Date; id: string } | null {
  if (!s) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (!Array.isArray(v) || v.length !== 2) return null;
    const [at, id] = v;
    if (typeof at !== "string" || typeof id !== "string" || !UUID_RE.test(id)) return null;
    if (!ISO_RE.test(at)) return null;
    const publishedAt = new Date(at);
    const year = publishedAt.getUTCFullYear();
    if (Number.isNaN(year) || year < 2000 || year > 2100) return null;
    return { publishedAt, id };
  } catch {
    return null;
  }
}

export function normalizeQuery(q: string | null | undefined): string | null {
  const t = (q ?? "").trim();
  return t ? t.slice(0, MAX_QUERY) : null;
}
