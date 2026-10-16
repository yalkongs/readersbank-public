import type { ArticleStatus } from "@/db/schema";

export function duplicateResponse(
  existing: { slug: string; status: ArticleStatus } | null,
): { status: 409; body: { error: string; slug?: string } } | null {
  if (!existing) return null;
  if (existing.status === "published") return { status: 409, body: { error: "이미 등록된 URL입니다", slug: existing.slug } };
  return { status: 409, body: { error: "이미 처리 중인 URL입니다" } };
}
