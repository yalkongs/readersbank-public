"use server";

import { getArticle } from "@/lib/articles/repo";
import { signReadToken } from "@/lib/auth/read-token";
import { isOwner } from "@/lib/auth/session";

export type ListenLinkResult = { ok: true; path: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 비공개 글을 24시간 동안 /read 로 열 수 있는 서명 링크(경로+쿼리). 소유자만 받을 수 있다. */
export async function getListenLinkAction(id: string): Promise<ListenLinkResult> {
  if (!(await isOwner())) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "글을 찾을 수 없어요." };
  const article = await getArticle(id);
  if (!article) return { ok: false, error: "글을 찾을 수 없어요." };
  if (article.status !== "published") return { ok: false, error: "게시된 글만 듣기 링크를 만들 수 있어요." };
  try {
    const t = await signReadToken(article.id);
    return { ok: true, path: `/a/${article.slug}/read?t=${encodeURIComponent(t)}` };
  } catch (err) {
    console.error("[listen-link] 듣기 링크 생성 실패", err);
    return { ok: false, error: "작업을 마치지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}
