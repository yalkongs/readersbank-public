import { neon } from "@neondatabase/serverless";
import type { BrowserContext } from "@playwright/test";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/auth/session";

// 공유 DB를 쓰므로 테스트가 만든 행은 이 표식으로 찾아 지운다.
export const E2E_MARK = "[E2E TEST]";


export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 필요합니다(.env.local)");
  return neon(url);
}

export async function loginAsOwner(context: BrowserContext, baseURL: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET이 필요합니다(.env.local)");
  await context.addCookies([{ name: SESSION_COOKIE, value: await createSessionToken(secret), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

/** 표식이 붙은 테스트 글을 모두 지운다(처리 중이어도 직접 DELETE. article_tags·llm_usage는 CASCADE). */
export async function deleteMarkedArticles() {
  const db = sql();
  await db.query("DELETE FROM articles WHERE source_text LIKE $1 OR title_ko LIKE $1", [`${E2E_MARK}%`]);
}

/** 표식이 붙은 API 토큰을 폐기하고 행을 지운다. */
export async function deleteMarkedTokens() {
  const db = sql();
  await db.query("UPDATE api_tokens SET revoked_at = now() WHERE name LIKE $1 AND revoked_at IS NULL", [`${E2E_MARK}%`]);
  await db.query("DELETE FROM api_tokens WHERE name LIKE $1", [`${E2E_MARK}%`]);
}

export function uniqueMark(label: string) {
  return `${E2E_MARK} ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 시험에 쓸 실제 글은 공유 DB에서 그때그때 고른다(관리자가 특정 글을 비공개로 바꾸거나 지워도 깨지지 않게).
/** 공개·게시된 번역 글 중 그림이 있는 것(번역·원문 전환, 그림 확대 시험용). */
export async function findTranslatedSlug(): Promise<string | null> {
  const rows = (await sql().query(
    `SELECT slug FROM articles
      WHERE status = 'published' AND is_public AND lang <> 'ko' AND body_ko IS NOT NULL
        AND jsonb_array_length(body_ko) = jsonb_array_length(body_original)
        AND body_original @> '[{"type":"figure"}]'::jsonb
      ORDER BY published_at DESC LIMIT 1`,
  )) as { slug: string }[];
  return rows[0]?.slug ?? null;
}

/** 공개·게시된 한국어 글(번역 없음). */
export async function findKoreanSlug(): Promise<string | null> {
  const rows = (await sql().query(
    `SELECT slug FROM articles WHERE status = 'published' AND is_public AND lang = 'ko' ORDER BY published_at DESC LIMIT 1`,
  )) as { slug: string }[];
  return rows[0]?.slug ?? null;
}
