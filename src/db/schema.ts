// src/db/schema.ts
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Block } from "@/lib/blocks";

export type SourceType = "text" | "url" | "notion" | "docx" | "pdf";
export type ArticleStatus = "queued" | "processing" | "published" | "failed";
// 글 끝 "더 읽어볼 글": 웹 검색으로 찾은 외부 글.
export type RelatedLink = { url: string; title: string; titleKo: string; site: string; why: string };
// 다시 처리하는 동안 공개 화면에 계속 보여 줄 직전 게시본. 처리가 끝나 다시 게시되면 비운다.
export type PublishedSnapshot = {
  titleKo: string | null;
  titleOriginal: string | null;
  leadKo: string | null;
  summaryKo: string[] | null;
  bodyOriginal: Block[] | null;
  bodyKo: Block[] | null;
  untranslated: number[];
  coverImage: string | null;
  lang: string | null;
  relatedLinks: RelatedLink[] | null;
};
export type AudioStatus = "generating" | "failed";
// 저장된 낭독 오디오의 정보. cues는 [블록 번호, 시작 초] — 재생 위치에 맞춰 문단을 하이라이트한다.
// hash는 오디오를 만든 본문의 지문으로, 본문이 바뀌면 읽기 화면에서 오디오를 숨긴다.
export type AudioMeta = { hash: string; chars: number; seconds: number; voiceId: string; model: string; cues: [number, number][] };

// 검색용 trigram GIN 인덱스는 drizzle/0001_search_trgm.sql(커스텀 마이그레이션)에서 만든다.
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    titleKo: text("title_ko"),
    titleOriginal: text("title_original"),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    sourceUrl: text("source_url"),
    sourceText: text("source_text"),
    sourceFileBlob: text("source_file_blob"),
    sourceFileName: text("source_file_name"),
    sourceFileType: text("source_file_type"),
    lang: text("lang"),
    leadKo: text("lead_ko"),
    summaryKo: jsonb("summary_ko").$type<string[]>(),
    bodyOriginal: jsonb("body_original").$type<Block[]>(),
    bodyKo: jsonb("body_ko").$type<Block[]>(),
    untranslated: jsonb("untranslated").$type<number[]>().notNull().default([]),
    coverImage: text("cover_image"),
    // 표지를 이미지 생성 모델로 만들었는지(다시 만들거나 지울 때 이전 파일 정리).
    coverGenerated: boolean("cover_generated").notNull().default(false),
    // AI 표지 설계(분위기·매체·색감). 다음 표지를 만들 때 최근 화풍과 겹치지 않게 참고한다.
    coverPlan: jsonb("cover_plan").$type<{ mood: string; medium: string; palette: string }>(),
    // AI 표지로 바꾸기 전 원문에서 가져온 표지. AI 표지를 지우면 이 그림으로 되돌린다.
    coverSource: text("cover_source"),
    relatedLinks: jsonb("related_links").$type<RelatedLink[]>(),
    // 낭독 오디오(OpenAI TTS, 관리 화면에서 요청할 때 만든다). 글 처리 상태와 따로 관리한다.
    audioUrl: text("audio_url"),
    audioMeta: jsonb("audio_meta").$type<AudioMeta>(),
    audioStatus: text("audio_status").$type<AudioStatus>(),
    audioProgress: text("audio_progress"),
    audioError: text("audio_error"),
    audioStartedAt: timestamp("audio_started_at", { withTimezone: true }),
    publishedSnapshot: jsonb("published_snapshot").$type<PublishedSnapshot>(),
    status: text("status").$type<ArticleStatus>().notNull().default("queued"),
    progress: text("progress"),
    currentStep: text("current_step"),
    failedStep: text("failed_step"),
    error: text("error"),
    isPublic: boolean("is_public").notNull().default(true),
    searchText: text("search_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("articles_list_idx").on(t.isPublic, t.status, t.publishedAt),
    index("articles_source_url_idx").on(t.sourceUrl),
  ],
);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const articleTags = pgTable(
  "article_tags",
  {
    articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const llmUsage = pgTable("llm_usage", {
  id: serial("id").primaryKey(),
  articleId: uuid("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Article = typeof articles.$inferSelect;

// 외부(iOS 단축어 등)에서 /api/ingest를 부르는 API 토큰. 평문은 저장하지 않고 SHA-256 해시만 둔다.
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type ApiToken = typeof apiTokens.$inferSelect;

// 로그인 시도 제한(IP 기준). 갱신은 src/lib/auth/rate-limit.ts의 단일 upsert SQL로만 한다.
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});

// 소유자 기기의 웹 푸시 구독(Web Push). 실패·번역 누락·주간 요약 알림을 보낸다.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
