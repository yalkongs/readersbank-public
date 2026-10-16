import { z } from "zod";

export type InputKind = { type: "url"; url: string } | { type: "notion"; url: string } | { type: "text"; text: string };

export const IngestBodySchema = z
  .object({
    input: z.string().min(1).max(1_000_000).optional(),
    file: z.object({ url: z.string().url(), name: z.string().max(300), contentType: z.string().max(200) }).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((b) => (b.input !== undefined) !== (b.file !== undefined), { message: "input 또는 file 중 하나만 필요합니다" });

function isNotionHost(host: string): boolean {
  return host === "notion.so" || host.endsWith(".notion.so") || host === "notion.site" || host.endsWith(".notion.site");
}

export function classifyInput(raw: string): InputKind {
  const s = raw.trim();
  if (/^https?:\/\/\S+$/i.test(s)) {
    try {
      const u = new URL(s);
      u.hash = "";
      const url = u.toString();
      return isNotionHost(u.hostname.toLowerCase()) ? { type: "notion", url } : { type: "url", url };
    } catch {
      // URL처럼 보이지만 해석되지 않으면 텍스트로 취급
    }
  }
  return { type: "text", text: s };
}

export function isBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

// Google 문서 편집·보기 링크의 문서 ID. 웹에 게시한 문서(/d/e/…/pub)는 일반 웹 페이지로 둔다.
export function parseGoogleDocId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() !== "docs.google.com") return null;
    const m = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:\/|$)/.exec(u.pathname);
    return m && m[1] !== "e" ? m[1] : null;
  } catch {
    return null;
  }
}
