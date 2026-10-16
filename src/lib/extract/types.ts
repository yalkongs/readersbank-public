import { blocksToPlainText, type Block } from "@/lib/blocks";

// minChars: 본문이 이보다 짧으면 추출 실패로 본다. 웹 페이지는 MIN_CHARS(페이월·빈 페이지 감지),
// X 게시물과 직접 붙여넣은 글처럼 원래 짧을 수 있는 소스는 더 낮게 둔다.
export type ExtractResult = { title: string; blocks: Block[]; coverImage: string | null; minChars?: number };

export class ExtractError extends Error {}

export const MIN_CHARS = 200;
export const SHORT_MIN_CHARS = 20;
export const MAX_WORDS = 60_000;

export function assertContentSize(blocks: Block[], minChars: number = MIN_CHARS): void {
  const text = blocksToPlainText(blocks);
  if (text.replace(/\s/g, "").length < minChars) {
    throw new ExtractError("본문을 가져오지 못했습니다. 텍스트로 붙여넣어 주세요.");
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) {
    throw new ExtractError(`문서가 너무 깁니다 (${words.toLocaleString()}단어). ${MAX_WORDS.toLocaleString()}단어 이하로 나눠 등록해 주세요.`);
  }
}
