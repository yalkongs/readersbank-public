import type { RelatedLink } from "@/db/schema";
import { recordUsage, requireArticle, updateArticle } from "@/lib/articles/repo";
import { callWithWebSearch } from "@/lib/llm/client";
import { RELATED_SYSTEM, buildRelatedUser, parseRelated } from "@/lib/related";

// 글 하나의 추천을 찾아 저장한다. 실패해도 글 발행에는 영향을 주지 않도록 호출자가 오류를 삼킨다.
export async function refreshRelated(articleId: string): Promise<RelatedLink[]> {
  const a = await requireArticle(articleId);
  const { text, searchedUrls, usage } = await callWithWebSearch({ system: RELATED_SYSTEM, user: buildRelatedUser(a) });
  await recordUsage(articleId, "related", usage);
  const links = parseRelated(text, searchedUrls, a.sourceUrl);
  await updateArticle(articleId, { relatedLinks: links });
  return links;
}
