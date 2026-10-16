// 다시 처리하는 동안 직전 게시본을 계속 보여 주기 위한 순수 헬퍼.
import type { Article, PublishedSnapshot } from "@/db/schema";

export function takeSnapshot(a: Article): PublishedSnapshot {
  return {
    titleKo: a.titleKo,
    titleOriginal: a.titleOriginal,
    leadKo: a.leadKo,
    summaryKo: a.summaryKo,
    bodyOriginal: a.bodyOriginal,
    bodyKo: a.bodyKo,
    untranslated: a.untranslated,
    coverImage: a.coverImage,
    lang: a.lang,
    relatedLinks: a.relatedLinks,
  };
}

// 재처리 시작 때 보관할 게시본: 지금 게시 중이면 지금 내용을, 이미 보관본이 있으면(실패 뒤 다시 처리) 그것을 유지한다.
export function snapshotForReprocess(a: Article): PublishedSnapshot | null {
  if (a.status === "published") return takeSnapshot(a);
  return a.publishedSnapshot ?? null;
}

// 공개 화면용: 처리 중·실패 상태라도 보관본이 있으면 그 내용을 게시된 글처럼 돌려준다.
export function withSnapshot(a: Article): Article {
  if (a.status === "published" || !a.publishedSnapshot) return a;
  return { ...a, ...a.publishedSnapshot, status: "published" };
}
