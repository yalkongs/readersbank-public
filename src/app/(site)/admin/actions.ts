"use server";

import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { ConflictError, isArticleOwnedBlob, isReprocessAllowed, validateAdminTags, type ReprocessMode } from "@/lib/articles/admin-ops";
import { claimAudioGeneration, deleteArticle, getArticle, getTagNames, resetForReprocess, saveArticleEdit, setArticleTags, setVisibility, updateArticle } from "@/lib/articles/repo";
import { EditError, buildSearchText, editedBodyField, markdownToBody, sameStructure, validateTitle } from "@/lib/articles/edit";
import { createApiToken, revokeApiToken } from "@/lib/auth/api-token";
import { isOwner } from "@/lib/auth/session";
import { deleteArticleBlobs } from "@/lib/blob/article-blobs";
import { processArticle } from "@/workflows/process-article";
import { refreshRelated } from "@/lib/related-run";
import { notifyOwner, removeSubscription, saveSubscription } from "@/lib/notify";
import { CoverGenError, generateCover, removeGeneratedCover } from "@/lib/cover-gen";
import { generateAudio } from "@/workflows/generate-audio";
import { del } from "@vercel/blob";
import type { Article } from "@/db/schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

const NOT_OWNER = "로그인이 필요해요. 다시 로그인해 주세요.";
const NOT_FOUND = "글을 찾을 수 없어요.";
const BUSY_DELETE = "처리 중인 글은 삭제할 수 없어요. 끝난 뒤 다시 시도해 주세요.";
const BUSY_REPROCESS = "이미 처리 중인 글이에요. 끝난 뒤 다시 시도해 주세요.";
const FAILED = "작업을 마치지 못했어요. 잠시 후 다시 시도해 주세요.";
const MODE_NOT_ALLOWED: Record<ReprocessMode, string> = {
  resume: "이어서 처리는 실패한 글에만 쓸 수 있어요.",
  fill: "번역 누락이 있는 게시된 글에만 쓸 수 있어요.",
  retranslate: "번역 다시 하기는 한국어가 아닌 글에만 쓸 수 있어요.",
  full: "지금은 다시 처리할 수 없어요.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: readonly ReprocessMode[] = ["resume", "fill", "retranslate", "full"];

async function loadOwned(id: unknown): Promise<{ ok: true; article: Article } | { ok: false; error: string }> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: NOT_FOUND };
  const article = await getArticle(id);
  if (!article) return { ok: false, error: NOT_FOUND };
  return { ok: true, article };
}

function revalidateArticle(id: string, slug: string) {
  revalidatePath("/");
  // "layout"은 글 페이지와 그 아래 opengraph-image/twitter-image 경로까지 무효화한다(공개 전환 직후 미리보기 카드가 캐시에서 나가지 않게).
  revalidatePath(`/a/${slug}`, "layout");
  revalidatePath("/admin");
  revalidatePath(`/admin/a/${id}`);
}

export async function setVisibilityAction(id: string, isPublic: boolean): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  if (typeof isPublic !== "boolean") return { ok: false, error: FAILED };
  try {
    await setVisibility(r.article.id, isPublic);
  } catch (err) {
    console.error("[admin] 공개 범위 변경 실패", err);
    return { ok: false, error: FAILED };
  }
  revalidateArticle(r.article.id, r.article.slug);
  return { ok: true };
}

export async function saveTagsAction(id: string, tags: string[]): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const v = validateAdminTags(tags);
  if (!v.ok) return v;
  try {
    await setArticleTags(r.article.id, v.tags);
    // 태그는 검색 텍스트에도 들어가므로 함께 다시 만든다(발행 전 글은 발행 단계가 다시 만든다).
    if (r.article.status === "published") {
      await updateArticle(r.article.id, { searchText: buildSearchText(r.article, v.tags) });
    }
  } catch (err) {
    console.error("[admin] 태그 저장 실패", err);
    return { ok: false, error: FAILED };
  }
  revalidateArticle(r.article.id, r.article.slug);
  return { ok: true };
}

export async function reprocessAction(id: string, mode: ReprocessMode): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  if (!MODES.includes(mode)) return { ok: false, error: FAILED };
  if (article.status === "queued" || article.status === "processing") return { ok: false, error: BUSY_REPROCESS };
  if (!isReprocessAllowed(article, mode)) return { ok: false, error: MODE_NOT_ALLOWED[mode] };
  try {
    await resetForReprocess(article.id, mode);
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, error: BUSY_REPROCESS };
    console.error("[admin] 재처리 준비 실패", err);
    return { ok: false, error: FAILED };
  }
  let result: ActionResult = { ok: true };
  try {
    await start(processArticle, mode === "fill" ? [article.id, "fill" as const] : [article.id]);
  } catch (err) {
    console.error("[admin] 재처리 시작 실패", err);
    const error = "처리를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
    try {
      await updateArticle(article.id, { status: "failed", error });
    } catch (markErr) {
      console.error("[admin] 재처리 실패 상태 기록 실패", markErr);
    }
    result = { ok: false, error };
  }
  revalidateArticle(article.id, article.slug);
  return result;
}

const BUSY_EDIT = "처리 중인 글은 편집할 수 없어요. 끝난 뒤 다시 시도해 주세요.";

export async function saveEditAction(id: string, title: string, markdown: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  if (article.status === "queued" || article.status === "processing") return { ok: false, error: BUSY_EDIT };
  const field = editedBodyField(article);
  let titleKo: string;
  let body;
  try {
    titleKo = validateTitle(title);
    body = markdownToBody(markdown, article[field] ?? []);
  } catch (err) {
    if (err instanceof EditError) return { ok: false, error: err.message };
    throw err;
  }
  try {
    const next = { ...article, titleKo, [field]: body };
    // 블록 구성이 바뀌면 번역 누락 위치(인덱스)가 맞지 않으므로 지운다. 소유자가 직접 고친 본문으로 본다.
    const untranslated = field === "bodyKo" && !sameStructure(article.bodyKo ?? [], body) ? { untranslated: [] as number[] } : {};
    await saveArticleEdit(article.id, { titleKo, [field]: body, ...untranslated, searchText: buildSearchText(next, await getTagNames(article.id)) });
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, error: BUSY_EDIT };
    console.error("[admin] 편집 저장 실패", err);
    return { ok: false, error: FAILED };
  }
  revalidateArticle(article.id, article.slug);
  return { ok: true };
}

export async function refreshRelatedAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  if (r.article.status !== "published") return { ok: false, error: "게시된 글에서만 찾을 수 있어요." };
  try {
    await refreshRelated(r.article.id);
  } catch (err) {
    console.error("[admin] 추천 글 찾기 실패", err instanceof Error ? err.message : err);
    return { ok: false, error: "추천 글을 찾지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  revalidateArticle(r.article.id, r.article.slug);
  return { ok: true };
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  if (article.status === "queued" || article.status === "processing") return { ok: false, error: BUSY_DELETE };
  let blobUrls: string[];
  try {
    ({ blobUrls } = await deleteArticle(article.id));
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, error: BUSY_DELETE };
    console.error("[admin] 글 삭제 실패", err);
    return { ok: false, error: FAILED };
  }
  // Blob 정리는 best-effort: 실패해도 글 삭제는 이미 끝났으므로 로그만 남긴다.
  await deleteArticleBlobs(article.id, [...blobUrls, article.sourceFileBlob]);
  revalidatePath("/");
  revalidatePath(`/a/${article.slug}`, "layout");
  revalidatePath("/admin");
  return { ok: true };
}

// API 토큰 발급·폐기는 세션 전용이다(Bearer 토큰으로는 서버 액션에 도달할 수 없고, 여기서도 isOwner로 다시 확인한다).
export async function createTokenAction(name: string): Promise<{ ok: true; id: string; plaintext: string } | { ok: false; error: string }> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "토큰 이름을 입력해 주세요." };
  try {
    const t = await createApiToken(name);
    revalidatePath("/admin/tokens");
    return { ok: true, ...t };
  } catch (err) {
    console.error("[admin] 토큰 발급 실패", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: FAILED };
  }
}

export async function revokeTokenAction(id: string): Promise<ActionResult> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "토큰을 찾을 수 없어요." };
  try {
    await revokeApiToken(id);
  } catch (err) {
    console.error("[admin] 토큰 폐기 실패", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: FAILED };
  }
  revalidatePath("/admin/tokens");
  return { ok: true };
}

// 웹 푸시 구독 저장·해지·시험 발송. 구독 정보는 브라우저 PushManager가 만든 값이다.
type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

function validPushSub(sub: unknown): sub is PushSub {
  const s = sub as PushSub;
  if (!s || typeof s.endpoint !== "string" || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return false;
  if (s.endpoint.length > 1000 || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return false;
  try {
    return new URL(s.endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

export async function savePushAction(sub: unknown, label: string): Promise<ActionResult> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  if (!validPushSub(sub)) return { ok: false, error: "알림 구독 정보를 읽지 못했어요." };
  try {
    await saveSubscription({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: String(label).slice(0, 80) });
  } catch (err) {
    console.error("[admin] 알림 구독 저장 실패", err instanceof Error ? err.message : err);
    return { ok: false, error: FAILED };
  }
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function removePushAction(endpoint: string): Promise<ActionResult> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false, error: FAILED };
  try {
    await removeSubscription(endpoint);
  } catch (err) {
    console.error("[admin] 알림 해지 실패", err instanceof Error ? err.message : err);
    return { ok: false, error: FAILED };
  }
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function testPushAction(): Promise<ActionResult> {
  if (!(await isOwner())) return { ok: false, error: NOT_OWNER };
  const sent = await notifyOwner({ title: "ReadersBank 알림 시험", body: "이 기기에서 알림을 받을 수 있어요.", url: "/admin/notifications", tag: "test" });
  return sent > 0 ? { ok: true } : { ok: false, error: "보낼 기기가 없거나 전송에 실패했어요." };
}

// 표지 이미지 생성(Claude Opus가 설계, OpenAI 이미지 모델이 그림). 원문 표지가 있으면 보관해 두고 바꾼다.
export async function generateCoverAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  if (article.status === "queued" || article.status === "processing") return { ok: false, error: BUSY_EDIT };
  try {
    await generateCover(article.id);
  } catch (err) {
    if (err instanceof CoverGenError) return { ok: false, error: err.message };
    if (err instanceof ConflictError) return { ok: false, error: BUSY_EDIT };
    console.error("[admin] 표지 생성 실패", err instanceof Error ? err.message : err);
    return { ok: false, error: "표지를 만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  revalidateArticle(article.id, article.slug);
  return { ok: true };
}

export async function removeCoverAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  if (r.article.status === "queued" || r.article.status === "processing") return { ok: false, error: BUSY_EDIT };
  try {
    await removeGeneratedCover(r.article.id);
  } catch (err) {
    console.error("[admin] 표지 삭제 실패", err instanceof Error ? err.message : err);
    return { ok: false, error: FAILED };
  }
  revalidateArticle(r.article.id, r.article.slug);
  return { ok: true };
}

// 낭독 오디오 생성(OpenAI TTS). 길면 몇 분 걸리므로 워크플로로 돌리고 관리 화면이 진행 상황을 다시 불러온다.
export async function generateAudioAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  if (article.status !== "published") return { ok: false, error: "게시된 글에만 오디오를 만들 수 있어요." };
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: "음성 합성 키(OPENAI_API_KEY)가 설정되지 않았어요." };
  let startedAt: Date | null;
  try {
    startedAt = await claimAudioGeneration(article.id);
  } catch (err) {
    console.error("[admin] 오디오 생성 준비 실패", err);
    return { ok: false, error: FAILED };
  }
  if (!startedAt) return { ok: false, error: "이미 오디오를 만들고 있어요." };
  let result: ActionResult = { ok: true };
  try {
    await start(generateAudio, [article.id, startedAt.getTime()]);
  } catch (err) {
    console.error("[admin] 오디오 생성 시작 실패", err);
    const error = "오디오 생성을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
    await updateArticle(article.id, { audioStatus: "failed", audioProgress: null, audioError: error }).catch(() => {});
    result = { ok: false, error };
  }
  revalidatePath(`/admin/a/${article.id}`);
  return result;
}

// 오디오를 지운다(파일과 기록 모두). 생성 중이면 그 실행도 결과를 버리게 된다.
export async function removeAudioAction(id: string): Promise<ActionResult> {
  const r = await loadOwned(id);
  if (!r.ok) return r;
  const { article } = r;
  try {
    await updateArticle(article.id, { audioUrl: null, audioMeta: null, audioStatus: null, audioProgress: null, audioError: null, audioStartedAt: null });
  } catch (err) {
    console.error("[admin] 오디오 삭제 실패", err);
    return { ok: false, error: FAILED };
  }
  if (article.audioUrl && isArticleOwnedBlob(article.audioUrl, article.id)) {
    await del(article.audioUrl).catch((e) => console.error("[admin] 오디오 파일 삭제 실패", e instanceof Error ? e.message : e));
  }
  revalidateArticle(article.id, article.slug);
  return { ok: true };
}
