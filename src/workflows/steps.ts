import { FatalError } from "workflow";
import { blocksToPlainText, type Block } from "@/lib/blocks";
import { ArticleNotFoundError } from "@/lib/articles/admin-ops";
import { getTagNames, listTagNames, recordUsage, requireArticle, setArticleTags, updateArticle } from "@/lib/articles/repo";
import { readSourceFile } from "@/lib/blob/source-file";
import { blobImageStore } from "@/lib/blob/image-store";
import { extractFromFile } from "@/lib/extract/file";
import { extractFromNotion } from "@/lib/extract/notion";
import { extractFromText } from "@/lib/extract/text";
import { rehostImages } from "@/lib/images/rehost";
import { assertContentSize, type ExtractResult } from "@/lib/extract/types";
import { extractFromUrl } from "@/lib/extract/url";
import { extractFromGoogleDoc } from "@/lib/extract/gdocs";
import { isBlobUrl } from "@/lib/input";
import { quickLang } from "@/lib/lang";
import { callJson, LlmTruncatedError } from "@/lib/llm/client";
import { chunkBlocks } from "@/lib/translate/chunk";
import { buildSearchText } from "@/lib/articles/edit";
import { acceptRevisions, assembleTranslation, fillTranslation, validateTranslation } from "@/lib/translate/merge";
import {
  BRIEF_SYSTEM,
  BriefSchema,
  REVIEW_SYSTEM,
  ReviewSchema,
  TRANSLATE_SYSTEM,
  TranslationSchema,
  buildBriefUser,
  buildChunkRequest,
  buildReviewRequest,
  buildSourceContext,
  tailText,
  type Brief,
} from "@/lib/translate/prompts";
import { SUMMARY_SYSTEM, SummarySchema, buildSummaryUser, normalizeSummary } from "@/lib/summarize";
import { z } from "zod";
import { toStepError } from "./step-errors";
import { refreshRelated } from "@/lib/related-run";
import { notifyOwner, type PushMessage } from "@/lib/notify";
import { recentTitle } from "@/lib/ingest-ui";

export type ChunkResult = { entries: [number, Block][]; tail: string };

const LangSchema = z.object({ lang: z.string() });

// 행이 없으면(처리 중 삭제) FatalError로 바꿔 워크플로가 재시도 없이 멈추게 한다.
async function loadArticle(articleId: string) {
  try {
    return await requireArticle(articleId);
  } catch (e) {
    throw toStepError(e);
  }
}

async function originalBlocks(articleId: string): Promise<Block[]> {
  const a = await loadArticle(articleId);
  if (!a.bodyOriginal) throw new FatalError("추출된 본문이 없습니다");
  return a.bodyOriginal;
}

export async function extractStep(articleId: string): Promise<void> {
  "use step";
  await updateArticle(articleId, { status: "processing", currentStep: "extract", progress: "본문 추출 중", error: null, failedStep: null });
  const a = await loadArticle(articleId);
  if (a.bodyOriginal) return;
  let result: ExtractResult;
  try {
    if (a.sourceFileBlob) {
      const file = await readSourceFile(a.sourceFileBlob);
      const out = await extractFromFile(
        { bytes: file.bytes, name: a.sourceFileName ?? "", contentType: a.sourceFileType || file.contentType },
        { store: blobImageStore(articleId) },
      );
      if (out.usage) await recordUsage(articleId, "extract_pdf", out.usage);
      result = out.result;
    } else if (a.sourceType === "text") result = extractFromText(a.sourceText ?? "");
    else if (a.sourceType === "url" && a.sourceUrl)
      result = (await extractFromGoogleDoc(a.sourceUrl, blobImageStore(articleId))) ?? (await extractFromUrl(a.sourceUrl));
    else if (a.sourceType === "notion" && a.sourceUrl) result = await extractFromNotion(a.sourceUrl);
    else throw new FatalError(`${a.sourceType} 형식은 아직 지원하지 않습니다`);
    assertContentSize(result.blocks, result.minChars);
    // docx·pdf는 추출기가 이미지를 이미 Blob에 올렸다. 나머지(웹·Notion·붙여넣기·txt/md/html)는 재호스팅한다.
    if (a.sourceType !== "docx" && a.sourceType !== "pdf") {
      const store = blobImageStore(articleId);
      const rehosted = await rehostImages(result.blocks, { store });
      let coverImage = rehosted.cover;
      // 본문 그림이 없어도 표지가 외부 URL이면 따로 올린다. 실패하면 외부 URL을 남기지 않고 표지 없음으로 둔다.
      if (!coverImage && result.coverImage) {
        coverImage = isBlobUrl(result.coverImage)
          ? result.coverImage
          : (await rehostImages([{ type: "figure", src: result.coverImage }], { store })).cover;
      }
      result = { ...result, blocks: rehosted.blocks, coverImage };
    }
  } catch (e) {
    throw toStepError(e);
  }
  await updateArticle(articleId, { titleOriginal: result.title, bodyOriginal: result.blocks, coverImage: result.coverImage });
}

export async function detectLangStep(articleId: string): Promise<string> {
  "use step";
  await updateArticle(articleId, { currentStep: "detect_lang", progress: "언어 확인 중" });
  const plain = blocksToPlainText(await originalBlocks(articleId));
  let lang: string = quickLang(plain);
  if (lang === "unknown") {
    const { data, usage } = await callJson({
      model: "light",
      system: "Identify the main language of the text. Answer with a lowercase ISO 639-1 code in `lang`.",
      user: plain.slice(0, 2000),
      schema: LangSchema,
      effort: "low",
      maxTokens: 1000,
    });
    await recordUsage(articleId, "detect_lang", usage);
    lang = data.lang.trim().toLowerCase().slice(0, 2);
  }
  await updateArticle(articleId, { lang });
  return lang;
}

// 이어서 처리(resume)할 때 이미 번역된 본문이 있으면 번역을 다시 하지 않는다.
// retranslate·full은 bodyKo를 비우므로 다시 번역한다.
export async function hasTranslationStep(articleId: string): Promise<boolean> {
  "use step";
  const a = await loadArticle(articleId);
  return Array.isArray(a.bodyKo) && a.bodyKo.length > 0;
}

export async function briefStep(articleId: string): Promise<Brief> {
  "use step";
  await updateArticle(articleId, { currentStep: "translate", progress: "번역 준비 중" });
  const a = await loadArticle(articleId);
  try {
    const { data, usage } = await callJson({
      model: "main",
      system: BRIEF_SYSTEM,
      user: buildBriefUser(a.titleOriginal ?? "", blocksToPlainText(a.bodyOriginal ?? [])),
      schema: BriefSchema,
      effort: "medium",
    });
    await recordUsage(articleId, "brief", usage);
    return data;
  } catch (e) {
    throw toStepError(e);
  }
}

export async function planChunksStep(articleId: string): Promise<number[][]> {
  "use step";
  return chunkBlocks(await originalBlocks(articleId));
}

export async function translateChunkStep(
  articleId: string,
  brief: Brief,
  indices: number[],
  prevTail: string,
  n: number,
  total: number,
): Promise<ChunkResult> {
  "use step";
  await updateArticle(articleId, { currentStep: "translate", progress: `번역 ${n}/${total}` });
  const original = await originalBlocks(articleId);
  const req = buildChunkRequest(
    brief,
    indices.map((index) => ({ index, block: original[index] })),
    prevTail,
    buildSourceContext(original),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    let items;
    try {
      const { data, usage } = await callJson({
        model: "main",
        system: TRANSLATE_SYSTEM,
        cachedContext: req.cachedContext,
        user: req.user,
        schema: TranslationSchema,
        effort: "high",
      });
      await recordUsage(articleId, "translate", usage);
      items = data.items;
    } catch (e) {
      // 응답이 길이 한도에서 잘리면 실패한 시도로 보고 재요청한다. 두 번 다 잘리면 원문 유지.
      if (e instanceof LlmTruncatedError) continue;
      throw toStepError(e);
    }
    const map = validateTranslation(original, indices, items);
    if (map) {
      const entries = [...map.entries()];
      return { entries, tail: tailText(entries.map(([, b]) => b)) };
    }
  }
  return { entries: [], tail: prevTail };
}

export async function saveTranslationStep(articleId: string, results: ChunkResult[]): Promise<void> {
  "use step";
  const original = await originalBlocks(articleId);
  const { body, untranslated } = assembleTranslation(original, results.flatMap((r) => r.entries));
  await updateArticle(articleId, { bodyKo: body, untranslated });
}

export type ReviewResult = { entries: [number, Block][] };

// 번역을 마친 뒤 원문과 대조해 오역·누락·번역투를 고친다. 다듬기는 품질을 높이는 단계라
// 실패해도 글 처리를 멈추지 않고 현재 번역을 그대로 둔다(글이 지워진 경우만 멈춘다).
export async function reviewChunkStep(articleId: string, brief: Brief, indices: number[], n: number, total: number): Promise<ReviewResult> {
  "use step";
  await updateArticle(articleId, { currentStep: "review", progress: `번역 다듬기 ${n}/${total}` });
  const a = await loadArticle(articleId);
  const original = a.bodyOriginal ?? [];
  const current = a.bodyKo ?? [];
  const missing = new Set(a.untranslated ?? []);
  const targets = indices.filter((i) => !missing.has(i) && original[i] && current[i]);
  if (targets.length === 0) return { entries: [] };
  const req = buildReviewRequest(
    brief,
    targets.map((index) => ({ index, original: original[index], translation: current[index] })),
    buildSourceContext(original),
  );
  try {
    const { data, usage } = await callJson({
      model: "main",
      system: REVIEW_SYSTEM,
      cachedContext: req.cachedContext,
      user: req.user,
      schema: ReviewSchema,
      effort: "medium",
    });
    await recordUsage(articleId, "review", usage);
    return { entries: acceptRevisions(current, targets, data.items) };
  } catch (e) {
    console.error("[review] 번역 다듬기 실패", articleId, n, e instanceof Error ? e.message : e);
    return { entries: [] };
  }
}

export async function saveReviewStep(articleId: string, results: ReviewResult[]): Promise<void> {
  "use step";
  const entries = results.flatMap((r) => r.entries);
  if (entries.length === 0) return;
  const a = await loadArticle(articleId);
  if (!a.bodyKo) return;
  const revised = new Map(entries);
  await updateArticle(articleId, { bodyKo: a.bodyKo.map((b, i) => revised.get(i) ?? b) });
}

// "누락 부분만 번역": 지난 번역에서 빠진 블록만 묶는다.
export async function planFillChunksStep(articleId: string): Promise<number[][]> {
  "use step";
  const a = await loadArticle(articleId);
  return chunkBlocks(a.bodyOriginal ?? [], undefined, new Set(a.untranslated ?? []));
}

export async function saveFillStep(articleId: string, results: ChunkResult[]): Promise<void> {
  "use step";
  const a = await loadArticle(articleId);
  if (!a.bodyKo) throw new FatalError("채울 번역문이 없습니다. 번역 다시 하기를 써 주세요.");
  const { body, untranslated } = fillTranslation(a.bodyKo, a.untranslated ?? [], results.flatMap((r) => r.entries));
  await updateArticle(articleId, { bodyKo: body, untranslated });
}

export async function summarizeStep(articleId: string): Promise<void> {
  "use step";
  await updateArticle(articleId, { currentStep: "summarize", progress: "요약 작성 중" });
  const a = await loadArticle(articleId);
  const body = blocksToPlainText(a.bodyKo ?? a.bodyOriginal ?? []);
  try {
    const { data, usage } = await callJson({
      model: "main",
      system: SUMMARY_SYSTEM,
      user: buildSummaryUser({ titleOriginal: a.titleOriginal ?? "", body, existingTags: await listTagNames() }),
      schema: SummarySchema,
      effort: "medium",
    });
    await recordUsage(articleId, "summarize", usage);
    const s = normalizeSummary(data);
    await updateArticle(articleId, { titleKo: s.titleKo || a.titleOriginal, leadKo: s.leadKo, summaryKo: s.summary });
    await setArticleTags(articleId, s.tags);
  } catch (e) {
    throw toStepError(e);
  }
}

export async function publishStep(articleId: string): Promise<void> {
  "use step";
  const a = await loadArticle(articleId);
  const tagNames = await getTagNames(articleId);
  const searchText = buildSearchText(a, tagNames);
  await updateArticle(articleId, {
    status: "published",
    currentStep: null,
    progress: null,
    error: null,
    failedStep: null,
    searchText,
    publishedAt: a.publishedAt ?? new Date(),
    publishedSnapshot: null,
  });
  const missing = a.untranslated?.length ?? 0;
  if (missing > 0) {
    await notifyArticle({ title: `번역 누락 ${missing}곳`, body: `${recentTitle(a)} — 관리 화면에서 "번역 다시 하기"로 채울 수 있어요.`, url: `/admin/a/${a.id}`, tag: `missing-${a.id}` });
  }
}

export async function markFailedStep(articleId: string, message: string): Promise<void> {
  "use step";
  let a;
  try {
    a = await requireArticle(articleId);
  } catch (e) {
    if (e instanceof ArticleNotFoundError) return; // 글이 이미 지워졌으면 기록할 곳이 없다
    throw e;
  }
  await updateArticle(articleId, { status: "failed", failedStep: a.currentStep, progress: null, error: message.slice(0, 500) });
  await notifyArticle({ title: "등록 실패", body: `${recentTitle(a)} — ${message}`, url: `/admin/a/${a.id}`, tag: `fail-${a.id}` });
}

// 운영 배포에서만 보낸다(로컬 개발·E2E가 공유 DB로 돌아도 소유자 기기에 알림이 가지 않게).
async function notifyArticle(msg: PushMessage): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") return;
  await notifyOwner(msg);
}

// 발행 뒤 "더 읽어볼 글"을 찾는다. 웹 검색 실패는 글에 영향을 주지 않으므로 기록만 하고 넘어간다.
// 이미 찾아 둔 글(이어서 처리·번역 다시 하기)은 다시 찾지 않는다.
export async function relatedStep(articleId: string): Promise<void> {
  "use step";
  try {
    const a = await requireArticle(articleId);
    if (a.status !== "published" || a.relatedLinks != null) return;
    await refreshRelated(articleId);
  } catch (e) {
    console.error("[related] 추천 글 찾기 실패", articleId, e instanceof Error ? e.message : e);
  }
}
