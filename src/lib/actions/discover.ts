"use server";

import type { ArticleStatus, RelatedLink } from "@/db/schema";
import { findBySourceUrl } from "@/lib/articles/repo";
import { isOwner } from "@/lib/auth/session";
import { DISCOVER_SYSTEM, buildDiscoverUser, normalizeTopic, parseDiscover } from "@/lib/discover";
import { callWithWebSearch } from "@/lib/llm/client";

export type DiscoverItem = RelatedLink & { existing: { slug: string; status: ArticleStatus } | null };
export type DiscoverResult = { ok: true; items: DiscoverItem[] } | { ok: false; error: string };

export async function discoverAction(topic: unknown): Promise<DiscoverResult> {
  if (!(await isOwner())) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };
  const t = normalizeTopic(topic);
  if (!t) return { ok: false, error: "주제어를 100자 이내로 적어 주세요." };
  try {
    const { text, searchedUrls, usage, searches } = await callWithWebSearch({
      system: DISCOVER_SYSTEM,
      user: buildDiscoverUser(t),
      maxUses: 6,
    });
    // 글에 묶이지 않는 호출이라 llm_usage 대신 로그로 남긴다.
    console.info("[discover]", JSON.stringify({ input: usage.input, output: usage.output, searches }));
    const links = parseDiscover(text, searchedUrls);
    const items = await Promise.all(links.map(async (l) => ({ ...l, existing: await findBySourceUrl(l.url) })));
    return { ok: true, items };
  } catch (e) {
    console.error("[discover] 글 찾기 실패", e instanceof Error ? e.message : e);
    return { ok: false, error: "글을 찾지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}
