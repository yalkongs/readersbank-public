// src/lib/articles/repo.ts
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  escapeLike,
  normalizeQuery,
  type ArticleCardData,
  type ListParams,
} from "@/lib/articles/listing";
import { ArticleNotFoundError, ConflictError, collectBlobUrls, planReprocess, type ReprocessMode } from "@/lib/articles/admin-ops";
import type { UsageRow } from "@/lib/usage";
import { snapshotForReprocess, withSnapshot } from "@/lib/articles/snapshot";
import { articles, articleTags, llmUsage, tags, type Article, type ArticleStatus, type SourceType } from "@/db/schema";

export type Usage = { input: number; output: number; cacheRead: number };

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function makeSlug(now: Date = new Date(), rand: () => number = Math.random): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += SLUG_ALPHABET[Math.floor(rand() * SLUG_ALPHABET.length)];
  return `${date}-${suffix}`;
}

export async function createArticle(input: {
  sourceType: SourceType;
  sourceUrl: string | null;
  sourceText: string | null;
  sourceFileBlob?: string | null;
  fileName?: string | null;
  fileContentType?: string | null;
  isPublic: boolean;
}): Promise<{ id: string; slug: string }> {
  const { fileName, fileContentType, ...rest } = input;
  const [row] = await db()
    .insert(articles)
    .values({ ...rest, sourceFileName: fileName ?? null, sourceFileType: fileContentType ?? null, slug: makeSlug() })
    .returning({ id: articles.id, slug: articles.slug });
  return row;
}

// 실패한 글은 같은 URL로 다시 등록할 수 있도록 중복 검사에서 제외한다.
export async function findBySourceUrl(url: string): Promise<{ slug: string; status: ArticleStatus } | null> {
  const [row] = await db()
    .select({ slug: articles.slug, status: articles.status })
    .from(articles)
    .where(and(eq(articles.sourceUrl, url), ne(articles.status, "failed")))
    .limit(1);
  return row ?? null;
}

/** 읽기 화면 주소(slug)로 관리 화면의 글 id를 찾는다. 상태와 공개 여부는 따지지 않는다. */
export async function findIdBySlug(slug: string): Promise<string | null> {
  const [row] = await db().select({ id: articles.id }).from(articles).where(eq(articles.slug, slug)).limit(1);
  return row?.id ?? null;
}

export async function getArticle(id: string): Promise<Article | null> {
  const [row] = await db().select().from(articles).where(eq(articles.id, id)).limit(1);
  return row ?? null;
}

export async function requireArticle(id: string): Promise<Article> {
  const row = await getArticle(id);
  if (!row) throw new ArticleNotFoundError(id);
  return row;
}

export async function updateArticle(id: string, patch: Partial<typeof articles.$inferInsert>): Promise<void> {
  await db().update(articles).set(patch).where(eq(articles.id, id));
}

export async function recordUsage(articleId: string, step: string, usage: Usage): Promise<void> {
  await db().insert(llmUsage).values({
    articleId,
    step,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
  });
}

// 공개 화면에 보이는 글: 게시됨, 또는 다시 처리 중이라 직전 게시본을 보관한 글.
const visible = () => or(eq(articles.status, "published"), isNotNull(articles.publishedSnapshot))!;
// 목록 열: 게시 중이면 현재 값, 다시 처리 중이면 보관본 값.
const live = sql`${articles.status} = 'published'`;
const pick = (col: unknown, key: string) => sql<string | null>`case when ${live} then ${col} else ${articles.publishedSnapshot}->>${key} end`;

export async function getPublishedBySlug(slug: string): Promise<Article | null> {
  const [row] = await db()
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), visible(), eq(articles.isPublic, true)))
    .limit(1);
  return row ? withSnapshot(row) : null;
}

/** 게시된 글을 공개 여부와 상관없이 가져온다. 호출하는 쪽이 비공개 글의 열람 권한(소유자·서명 토큰)을 확인해야 한다. */
export async function getBySlugForRead(slug: string): Promise<Article | null> {
  const [row] = await db()
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), visible()))
    .limit(1);
  return row ? withSnapshot(row) : null;
}

export async function listPublished(
  params: ListParams = {},
): Promise<{ items: ArticleCardData[]; nextCursor: string | null }> {
  const q = normalizeQuery(params.q);
  const tag = params.tag?.trim() || null;
  const cursor = decodeCursor(params.cursor);
  const conds = [visible(), eq(articles.isPublic, true), isNotNull(articles.publishedAt)];
  if (q) conds.push(sql`${articles.searchText} ILIKE ${"%" + escapeLike(q) + "%"} ESCAPE '\\'`);
  if (tag) {
    conds.push(sql`exists (select 1 from ${articleTags} at join ${tags} t on t.id = at.tag_id where at.article_id = ${articles.id} and t.name = ${tag})`);
  }
  if (cursor) conds.push(sql`(${articles.publishedAt}, ${articles.id}) < (${cursor.publishedAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
  const rows = await db()
    .select({
      slug: articles.slug,
      titleKo: pick(articles.titleKo, "titleKo"),
      titleOriginal: pick(articles.titleOriginal, "titleOriginal"),
      leadKo: pick(articles.leadKo, "leadKo"),
      quoteKo: sql<string | null>`case when ${live} then ${articles.summaryKo}->>0 else ${articles.publishedSnapshot}->'summaryKo'->>0 end`,
      coverImage: pick(articles.coverImage, "coverImage"),
      coverGenerated: articles.coverGenerated,
      lang: pick(articles.lang, "lang"),
      sourceUrl: articles.sourceUrl,
      publishedAt: articles.publishedAt,
      id: articles.id,
    })
    .from(articles)
    .where(and(...conds))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(PAGE_SIZE + 1);
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  const nextCursor = rows.length > PAGE_SIZE && last?.publishedAt ? encodeCursor(last.publishedAt, last.id) : null;
  return { items, nextCursor };
}

export async function listPublicTags(): Promise<{ name: string; count: number }[]> {
  const count = sql<number>`count(*)::int`;
  return db()
    .select({ name: tags.name, count })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .innerJoin(articles, eq(articleTags.articleId, articles.id))
    .where(and(visible(), eq(articles.isPublic, true)))
    .groupBy(tags.name)
    .orderBy(desc(count), tags.name)
    .limit(30);
}

export async function listForAdmin(
  opts: { status?: ArticleStatus | "all"; statuses?: ArticleStatus[]; isPublic?: boolean; q?: string; limit?: number } = {},
) {
  const { status = "all", limit = 50 } = opts;
  const q = normalizeQuery(opts.q);
  const conds = [];
  if (status !== "all") conds.push(eq(articles.status, status));
  if (opts.statuses?.length) conds.push(inArray(articles.status, opts.statuses));
  if (opts.isPublic !== undefined) conds.push(eq(articles.isPublic, opts.isPublic));
  if (q) {
    const like = "%" + escapeLike(q) + "%";
    conds.push(
      sql`(${articles.searchText} ILIKE ${like} ESCAPE '\\' or ${articles.titleOriginal} ILIKE ${like} ESCAPE '\\' or ${articles.sourceUrl} ILIKE ${like} ESCAPE '\\')`,
    );
  }
  return db()
    .select({
      id: articles.id,
      slug: articles.slug,
      titleKo: articles.titleKo,
      titleOriginal: articles.titleOriginal,
      sourceUrl: articles.sourceUrl,
      sourceFileName: articles.sourceFileName,
      status: articles.status,
      progress: articles.progress,
      failedStep: articles.failedStep,
      error: articles.error,
      isPublic: articles.isPublic,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(articles.createdAt))
    .limit(limit);
}

// 삭제 전에 지워야 할 Blob URL을 모아 반환한다. article_tags·llm_usage는 FK ON DELETE CASCADE.
// 처리 중(queued·processing)인 글은 지우지 않고 ConflictError를 던진다(워크플로가 지운 글을 다시 쓰지 않도록).
export async function deleteArticle(id: string): Promise<{ blobUrls: string[] }> {
  const a = await getArticle(id);
  if (!a) return { blobUrls: [] };
  const blobUrls = collectBlobUrls(a);
  const deleted = await db()
    .delete(articles)
    .where(and(eq(articles.id, id), ne(articles.status, "queued"), ne(articles.status, "processing")))
    .returning({ id: articles.id });
  if (deleted.length === 0) {
    // 그 사이 다른 요청이 이미 지웠다면 성공으로 본다. 남아 있으면 처리 중으로 바뀐 것.
    if (await getArticle(id)) throw new ConflictError();
  }
  return { blobUrls };
}

export async function setVisibility(id: string, isPublic: boolean): Promise<void> {
  await db().update(articles).set({ isPublic }).where(eq(articles.id, id));
}

export async function resetForReprocess(id: string, mode: ReprocessMode): Promise<void> {
  const a = await requireArticle(id);
  const patch = { ...planReprocess(a.status, mode), publishedSnapshot: snapshotForReprocess(a) };
  // 상태 검사와 갱신 사이의 경합을 막기 위해 처리 중이 아닐 때만 갱신한다.
  const updated = await db()
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, id), ne(articles.status, "queued"), ne(articles.status, "processing")))
    .returning({ id: articles.id });
  if (updated.length === 0) throw new ConflictError();
}

// 편집 저장. 처리 중인 글은 파이프라인이 덮어쓰므로 막는다(검사와 갱신 사이 경합도 조건부 UPDATE로 막음).
export async function saveArticleEdit(id: string, patch: Partial<typeof articles.$inferInsert>): Promise<void> {
  const updated = await db()
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, id), ne(articles.status, "queued"), ne(articles.status, "processing")))
    .returning({ id: articles.id });
  if (updated.length === 0) throw new ConflictError();
}

// 오디오 생성을 시작할 수 있으면 "생성 중"으로 표시하고 시작 시각을 돌려준다. 이미 생성 중이면 null.
// 30분 넘게 "생성 중"으로 남은 것은 멈춘 것으로 보고 다시 시작할 수 있게 한다.
export async function claimAudioGeneration(id: string): Promise<Date | null> {
  const startedAt = new Date();
  const updated = await db()
    .update(articles)
    .set({ audioStatus: "generating", audioProgress: "준비 중", audioError: null, audioStartedAt: startedAt })
    .where(
      and(
        eq(articles.id, id),
        or(sql`${articles.audioStatus} is distinct from 'generating'`, sql`${articles.audioStartedAt} < now() - interval '30 minutes'`),
      ),
    )
    .returning({ id: articles.id });
  return updated.length > 0 ? startedAt : null;
}

export async function getArticleUsage(id: string): Promise<UsageRow[]> {
  return db()
    .select({
      step: llmUsage.step,
      input: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::int`,
      output: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::int`,
      cacheRead: sql<number>`coalesce(sum(${llmUsage.cacheReadTokens}), 0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(llmUsage)
    .where(eq(llmUsage.articleId, id))
    .groupBy(llmUsage.step)
    .orderBy(llmUsage.step);
}

export async function listTagNames(): Promise<string[]> {
  const rows = await db().select({ name: tags.name }).from(tags);
  return rows.map((r) => r.name);
}

export async function setArticleTags(articleId: string, names: string[]): Promise<void> {
  await db().delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (names.length === 0) return;
  await db().insert(tags).values(names.map((name) => ({ name }))).onConflictDoNothing();
  const rows = await db().select({ id: tags.id }).from(tags).where(inArray(tags.name, names));
  await db()
    .insert(articleTags)
    .values(rows.map((r) => ({ articleId, tagId: r.id })))
    .onConflictDoNothing();
}

export async function getTagNames(articleId: string): Promise<string[]> {
  const rows = await db()
    .select({ name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId));
  return rows.map((r) => r.name);
}

// 최근 만든 AI 표지들의 화풍(이 글 제외). 새 표지가 겹치지 않게 Opus에게 알려 준다.
export async function recentCoverPlans(excludeId: string, limit: number): Promise<{ mood: string; medium: string; palette: string }[]> {
  const rows = await db()
    .select({ plan: articles.coverPlan })
    .from(articles)
    .where(and(eq(articles.coverGenerated, true), isNotNull(articles.coverPlan), ne(articles.id, excludeId)))
    .orderBy(desc(articles.createdAt))
    .limit(limit);
  return rows.flatMap((r) => (r.plan ? [r.plan] : []));
}

// 이어서 읽기 목록 확인용: 주어진 slug 중 지금 열 수 있는 글만 돌려준다(비공개 글은 소유자에게만).
export async function viewableSlugs(slugs: string[], owner: boolean): Promise<string[]> {
  if (slugs.length === 0) return [];
  const conds = [inArray(articles.slug, slugs), visible()];
  if (!owner) conds.push(eq(articles.isPublic, true));
  const rows = await db().select({ slug: articles.slug }).from(articles).where(and(...conds));
  return rows.map((r) => r.slug);
}
