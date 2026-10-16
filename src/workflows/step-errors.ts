import { FatalError } from "workflow";
import { ArticleNotFoundError } from "@/lib/articles/admin-ops";
import { ExtractError } from "@/lib/extract/types";
import { LlmRefusalError } from "@/lib/llm/client";
import { FetchStatusError, UnsafeUrlError } from "@/lib/net/safe-fetch";

export const ARTICLE_DELETED = "글이 삭제되었습니다";

export function toStepError(e: unknown): unknown {
  // 처리 중에 글이 지워졌으면 재시도해도 소용없다.
  if (e instanceof ArticleNotFoundError) return new FatalError(ARTICLE_DELETED);
  if (e instanceof ExtractError || e instanceof UnsafeUrlError || e instanceof LlmRefusalError) {
    return new FatalError(e.message);
  }
  if (e instanceof FetchStatusError) {
    if (e.status === 401 || e.status === 402 || e.status === 403) {
      return new FatalError("이 페이지는 로그인이나 구독이 필요해 본문을 가져오지 못했습니다. 텍스트로 붙여넣어 주세요.");
    }
    if (e.status === 404 || e.status === 410) return new FatalError("페이지를 찾을 수 없습니다. 주소를 확인해 주세요.");
    if (e.status < 500 && e.status !== 408 && e.status !== 429) return new FatalError(e.message);
  }
  return e;
}

export function userFacingMessage(e: unknown): string {
  if (e instanceof Error && /[가-힣]/.test(e.message)) return e.message;
  return "일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
