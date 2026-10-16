// src/lib/articles/admin-ops.ts — 관리 동작의 순수 로직(DB 없음).
import type { Block } from "@/lib/blocks";
import type { ArticleStatus } from "@/db/schema";
import { isBlobUrl } from "@/lib/input";
import { hasCjkOrKana, normalizeTags } from "@/lib/tags";
import { isTranslatable } from "@/lib/lang";

export class ConflictError extends Error {
  constructor(message = "처리 중인 글입니다") {
    super(message);
    this.name = "ConflictError";
  }
}

// 글 행이 없을 때(이미 삭제됨). 워크플로에서는 재시도하지 않는 FatalError로 바꾼다.
export class ArticleNotFoundError extends Error {
  constructor(id: string) {
    super(`글을 찾을 수 없습니다: ${id}`);
    this.name = "ArticleNotFoundError";
  }
}

export type ReprocessMode = "resume" | "fill" | "retranslate" | "full";

// resume은 추출 결과(bodyOriginal)를 유지한 채 실패 지점부터 이어서 처리한다.
// retranslate는 번역 산출물을 비우고, full은 원문 추출까지 다시 하도록 bodyOriginal·coverImage도 비운다.
export function planReprocess(status: ArticleStatus, mode: ReprocessMode) {
  if (status === "queued" || status === "processing") throw new ConflictError();
  const base = { status: "queued" as const, error: null, failedStep: null, progress: null };
  if (mode === "resume" || mode === "fill") return base;
  const translation = { ...base, bodyKo: null, untranslated: [] as number[], titleKo: null, leadKo: null, summaryKo: null };
  if (mode === "retranslate") return translation;
  return { ...translation, bodyOriginal: null, coverImage: null, coverGenerated: false, coverPlan: null, coverSource: null, relatedLinks: null };
}

// 글을 지울 때 함께 지워도 되는 Blob인지. 다른 글이 같은 그림 주소를 쓸 수 있으므로
// 이 글의 이미지 폴더(images/{articleId}/)와 업로드 원본(uploads/)만 허용한다.
// 인코딩된 구분자(%2F, %5C)나 ..(%2e%2e)로 접두사 검사를 우회하는 경로는 거부한다.
// 한글 파일명처럼 일반 문자만 인코딩된 경로는 허용한다.
function safeBlobPath(url: string): string | null {
  if (!isBlobUrl(url)) return null;
  const path = new URL(url).pathname;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.includes("\\")) return null;
  if (decoded.split("/").length !== path.split("/").length) return null;
  if (decoded.split("/").some((seg) => seg === "." || seg === "..")) return null;
  return path;
}

export function isArticleOwnedBlob(url: string, articleId: string): boolean {
  return safeBlobPath(url)?.startsWith(`/images/${articleId}/`) ?? false;
}

export function isUploadedSourceBlob(url: string): boolean {
  return safeBlobPath(url)?.startsWith("/uploads/") ?? false;
}

export function collectBlobUrls(a: {
  id: string;
  sourceFileBlob: string | null;
  coverImage: string | null;
  coverSource?: string | null;
  bodyOriginal: Block[] | null;
  bodyKo: Block[] | null;
}): string[] {
  const out = new Set<string>();
  if (a.sourceFileBlob && isUploadedSourceBlob(a.sourceFileBlob)) out.add(a.sourceFileBlob);
  const addOwned = (u: string | null | undefined) => {
    if (u && isArticleOwnedBlob(u, a.id)) out.add(u);
  };
  addOwned(a.coverImage);
  addOwned(a.coverSource);
  for (const blocks of [a.bodyOriginal, a.bodyKo]) {
    for (const b of blocks ?? []) if (b.type === "figure") addOwned(b.src);
  }
  return [...out];
}

export const MAX_ADMIN_TAGS = 6;
const MAX_TAG_LENGTH = 30;

// 관리 화면 태그 편집 입력 검증. 한자·가나가 들어간 태그는 조용히 버리지 않고 거부한다.
export function validateAdminTags(input: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.some((t) => typeof t !== "string")) return { ok: false, error: "태그 형식이 올바르지 않아요" };
  const raw = (input as string[]).map((t) => t.trim()).filter(Boolean);
  const bad = raw.find(hasCjkOrKana);
  if (bad) return { ok: false, error: `한자나 일본어 가나가 들어간 태그는 쓸 수 없어요: ${bad}` };
  const long = raw.find((t) => Array.from(t).length > MAX_TAG_LENGTH);
  if (long) return { ok: false, error: `태그는 ${MAX_TAG_LENGTH}자 이하로 써 주세요` };
  return { ok: true, tags: normalizeTags(raw, MAX_ADMIN_TAGS) };
}

export type AdminFilterKey = "all" | "processing" | "published" | "failed" | "private";
export type AdminFilter = { key: AdminFilterKey; statuses?: ArticleStatus[]; isPublic?: boolean };

export function parseAdminFilter(raw: string | undefined): AdminFilter {
  switch (raw) {
    case "processing":
      return { key: "processing", statuses: ["queued", "processing"] };
    case "published":
    case "failed":
      return { key: raw, statuses: [raw] };
    case "private":
      return { key: "private", isPublic: false };
    default:
      return { key: "all" };
  }
}

// 상세 화면에서 어떤 재처리 버튼을 켤지. 처리 중이면 모두 끈다.
export function reprocessOptions(a: {
  status: ArticleStatus;
  lang: string | null;
  untranslated?: number[] | null;
  bodyKo?: unknown[] | null;
}): Record<ReprocessMode, boolean> {
  const idle = a.status !== "queued" && a.status !== "processing";
  const fill = idle && a.status === "published" && isTranslatable(a.lang) && Boolean(a.bodyKo) && (a.untranslated?.length ?? 0) > 0;
  return { resume: idle && a.status === "failed", fill, retranslate: idle && isTranslatable(a.lang), full: idle };
}

export function isReprocessAllowed(a: Parameters<typeof reprocessOptions>[0], mode: ReprocessMode): boolean {
  const opts = reprocessOptions(a);
  return Object.hasOwn(opts, mode) && opts[mode];
}
