import {
  briefStep,
  detectLangStep,
  extractStep,
  hasTranslationStep,
  markFailedStep,
  planChunksStep,
  planFillChunksStep,
  saveFillStep,
  publishStep,
  relatedStep,
  reviewChunkStep,
  saveReviewStep,
  saveTranslationStep,
  summarizeStep,
  translateChunkStep,
  type ChunkResult,
  type ReviewResult,
} from "./steps";
import { userFacingMessage } from "./step-errors";
import { isTranslatable } from "@/lib/lang";
import type { Brief } from "@/lib/translate/prompts";

export const TRANSLATE_GROUP_SIZE = 3;

// 청크를 3개씩 병렬로 번역하고, 각 묶음은 앞 묶음의 끝부분을 문맥으로 받는다.
async function translateChunks(articleId: string, brief: Brief, chunks: number[][]): Promise<ChunkResult[]> {
  const results: ChunkResult[] = [];
  let prevTail = "";
  for (let start = 0; start < chunks.length; start += TRANSLATE_GROUP_SIZE) {
    const group = chunks.slice(start, start + TRANSLATE_GROUP_SIZE);
    const out = await Promise.all(group.map((indices, k) => translateChunkStep(articleId, brief, indices, prevTail, start + k + 1, chunks.length)));
    results.push(...out);
    prevTail = out[out.length - 1].tail;
  }
  return results;
}

// 다듬기는 청크끼리 서로 기다릴 필요가 없지만, 요청이 한꺼번에 몰리지 않게 같은 크기로 묶어 돌린다.
async function reviewChunks(articleId: string, brief: Brief, chunks: number[][]): Promise<ReviewResult[]> {
  const results: ReviewResult[] = [];
  for (let start = 0; start < chunks.length; start += TRANSLATE_GROUP_SIZE) {
    const group = chunks.slice(start, start + TRANSLATE_GROUP_SIZE);
    results.push(...(await Promise.all(group.map((indices, k) => reviewChunkStep(articleId, brief, indices, start + k + 1, chunks.length)))));
  }
  return results;
}

// mode "fill": 게시된 글의 번역 누락분만 다시 번역해 채운다(요약·추천은 그대로 둔다).
export async function processArticle(articleId: string, mode?: "fill"): Promise<{ status: "published" }> {
  "use workflow";
  try {
    if (mode === "fill") {
      const brief = await briefStep(articleId);
      const chunks = await planFillChunksStep(articleId);
      await saveFillStep(articleId, await translateChunks(articleId, brief, chunks));
      await publishStep(articleId);
      return { status: "published" };
    }
    await extractStep(articleId);
    const lang = await detectLangStep(articleId);
    if (isTranslatable(lang) && !(await hasTranslationStep(articleId))) {
      const brief = await briefStep(articleId);
      const chunks = await planChunksStep(articleId);
      await saveTranslationStep(articleId, await translateChunks(articleId, brief, chunks));
      await saveReviewStep(articleId, await reviewChunks(articleId, brief, chunks));
    }
    await summarizeStep(articleId);
    await publishStep(articleId);
    await relatedStep(articleId);
    return { status: "published" };
  } catch (e) {
    await markFailedStep(articleId, userFacingMessage(e));
    throw e;
  }
}
