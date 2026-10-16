// 그림 없는 글의 표지를 만든다: Claude Opus가 글을 읽고 장면·화풍을 설계(프롬프트)하고,
// OpenAI 이미지 모델이 그린다. 이미지 모델은 한글을 망가뜨리므로 글자 없는 그림만 요청한다.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { del, put } from "@vercel/blob";
import OpenAI from "openai";
import { z } from "zod";
import type { Article } from "@/db/schema";
import { isArticleOwnedBlob } from "@/lib/articles/admin-ops";
import { getTagNames, recentCoverPlans, recordUsage, requireArticle, saveArticleEdit } from "@/lib/articles/repo";
import { blocksToPlainText } from "@/lib/blocks";
import { callJson } from "@/lib/llm/client";

export const IMAGE_MODEL = "gpt-image-2";
const SIZE = "1536x1024" as const;
const JPEG_QUALITY = 86;

export const CoverPlanSchema = z.object({
  // 글의 고유한 어조(예: 서정적 에세이, 냉정한 기술 분석, 풍자적 칼럼)
  mood: z.string(),
  // 그림이 담을 이 글만의 핵심 주장·장면(일반적인 주제가 아니라)
  subject: z.string(),
  // 매체·화풍(예: 35mm 다큐 사진, 목판화, 리소 인쇄, 수채, 콜라주, 아이소메트릭 3D)
  medium: z.string(),
  palette: z.string(),
  prompt: z.string(),
});
export type CoverPlan = z.infer<typeof CoverPlanSchema>;
export type StoredCoverPlan = { mood: string; medium: string; palette: string };

export const COVER_SYSTEM = `You are the art director of a thoughtful Korean web magazine. Every article gets a cover made for it alone. Read the article (title, summary and the opening of the body) and design ONE landscape cover image (3:2).

Work in this order:
1. mood — Name the article's own voice and emotional temperature in a few words (e.g. "wry, skeptical tech critique", "tender personal essay", "sober historical analysis", "urgent investigative report", "playful explainer", "contemplative philosophy").
2. subject — Find the article's SPECIFIC central claim, tension or image and express it as a concrete visual metaphor or scene that someone who read the piece would recognise. Avoid generic depictions of the broad topic and avoid clichés (glowing brains, robots shaking hands, circuit boards, lightbulbs, chess pieces, hourglasses).
3. medium — Choose the medium/technique whose character matches the mood. Range widely, e.g.: 35mm documentary photograph, medium-format studio still life, aerial photograph, cyanotype, Japanese woodblock print, linocut, copperplate engraving, risograph print, Swiss-style geometric poster, flat vector editorial illustration, gouache, loose ink-and-wash, watercolor, charcoal sketch, paper-cut collage, mixed-media collage, isometric 3D render, claymation still, blueprint/technical drawing, minimalist abstract composition. A tender essay should not look like a corporate tech report; a sharp critique should not look like a children's book.
4. palette — A specific palette that fits the mood (name 3–5 colours or a reference such as "faded 1970s Kodachrome").
5. prompt — English, 80–160 words, describing subject, composition, medium, lighting/texture and palette precisely.

Hard rules:
- The medium AND palette must differ clearly from every "recently used" cover listed in the input. Do not default to dramatic oil painting unless the article truly calls for it and it is not recently used.
- Absolutely no text, letters, numbers, captions, logos, watermarks or UI screenshots in the image.
- No real, identifiable people or brand trademarks; people may appear only as anonymous figures.
- Magazine-quality composition with a clear focal point.`;

const EXCERPT_CHARS = 3000;

export function buildCoverUser(
  a: Pick<Article, "titleKo" | "titleOriginal" | "leadKo" | "summaryKo">,
  opts: { excerpt?: string; tags?: string[]; recent?: StoredCoverPlan[] } = {},
): string {
  const recent = opts.recent ?? [];
  return [
    a.titleKo && `제목: ${a.titleKo}`,
    a.titleOriginal && a.titleOriginal !== a.titleKo && `원제: ${a.titleOriginal}`,
    a.leadKo && `한 줄 소개: ${a.leadKo}`,
    a.summaryKo?.length && `요약:\n${a.summaryKo.map((s) => `- ${s}`).join("\n")}`,
    opts.tags?.length && `태그: ${opts.tags.join(", ")}`,
    opts.excerpt && `본문 앞부분:\n${opts.excerpt.slice(0, EXCERPT_CHARS)}`,
    recent.length
      ? `Recently used covers (avoid these media and palettes):\n${recent.map((r) => `- ${r.medium} / ${r.palette} (${r.mood})`).join("\n")}`
      : "Recently used covers: none",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// 모델이 글자를 넣지 않도록 프롬프트 끝에 한 번 더 못박는다.
export function finalImagePrompt(plan: CoverPlan): string {
  return `${plan.prompt.trim()}\n\nMedium: ${plan.medium}. Palette: ${plan.palette}. No text, no letters, no words, no logos, no watermark.`;
}

export class CoverGenError extends Error {}

async function toJpeg(bytes: Uint8Array): Promise<Buffer> {
  const img = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas.toBuffer("image/jpeg", JPEG_QUALITY);
}

// 표지를 만들어 저장하고 새 주소를 돌려준다. 이전 표지가 AI 표지면 파일을 지운다.
// 원문에서 가져온 표지는 지우지 않고 coverSource에 남겨 두어, AI 표지를 지우면 되돌린다.
export async function generateCover(articleId: string): Promise<string> {
  // 설계(Opus) 비용을 쓰기 전에 그림 키부터 확인한다.
  if (!process.env.OPENAI_API_KEY) throw new CoverGenError("이미지 생성 키(OPENAI_API_KEY)가 설정되지 않았어요.");
  const a = await requireArticle(articleId);
  if (!a.leadKo && !(a.summaryKo?.length ?? 0) && !a.titleKo) throw new CoverGenError("요약이 없어 표지를 설계할 수 없어요. 먼저 처리를 끝내 주세요.");

  const [tags, recent] = await Promise.all([getTagNames(articleId), recentCoverPlans(articleId, 8)]);
  const excerpt = blocksToPlainText(a.bodyKo ?? a.bodyOriginal ?? []);
  const { data: plan, usage } = await callJson({
    model: "opus",
    system: COVER_SYSTEM,
    user: buildCoverUser(a, { excerpt, tags, recent }),
    schema: CoverPlanSchema,
    effort: "low",
    maxTokens: 4000,
  });
  await recordUsage(articleId, "cover_prompt", usage);

  const res = await new OpenAI().images.generate({ model: IMAGE_MODEL, prompt: finalImagePrompt(plan), size: SIZE, quality: "medium", n: 1 });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new CoverGenError("이미지 모델이 그림을 돌려주지 않았어요.");
  const jpeg = await toJpeg(Buffer.from(b64, "base64"));
  const blob = await put(`images/${articleId}/cover-ai.jpg`, jpeg, { access: "public", contentType: "image/jpeg", addRandomSuffix: true });

  const previous = a.coverGenerated ? a.coverImage : null;
  await saveArticleEdit(articleId, {
    coverImage: blob.url,
    coverGenerated: true,
    coverSource: a.coverGenerated ? a.coverSource : a.coverImage,
    coverPlan: { mood: plan.mood.slice(0, 120), medium: plan.medium.slice(0, 120), palette: plan.palette.slice(0, 160) },
  });
  if (previous && isArticleOwnedBlob(previous, articleId)) {
    await del(previous).catch((e) => console.error("[cover] 이전 표지 삭제 실패", e instanceof Error ? e.message : e));
  }
  return blob.url;
}

// AI 표지를 지운다(파일과 표지 지정 모두). 원문 표지가 있었으면 그것으로 되돌린다.
export async function removeGeneratedCover(articleId: string): Promise<void> {
  const a = await requireArticle(articleId);
  if (!a.coverGenerated) return;
  await saveArticleEdit(articleId, { coverImage: a.coverSource ?? null, coverGenerated: false, coverPlan: null, coverSource: null });
  if (a.coverImage && isArticleOwnedBlob(a.coverImage, articleId)) {
    await del(a.coverImage).catch((e) => console.error("[cover] 표지 삭제 실패", e instanceof Error ? e.message : e));
  }
}
