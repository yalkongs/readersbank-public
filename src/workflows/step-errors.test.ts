import { describe, expect, it } from "vitest";
import { FatalError } from "workflow";
import { ArticleNotFoundError } from "@/lib/articles/admin-ops";
import { ExtractError } from "@/lib/extract/types";
import { LlmRefusalError } from "@/lib/llm/client";
import { FetchStatusError, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { toStepError, userFacingMessage } from "@/workflows/step-errors";

describe("toStepError", () => {
  it("maps permanent errors to FatalError with Korean messages", () => {
    expect(toStepError(new ExtractError("본문 없음"))).toBeInstanceOf(FatalError);
    expect(toStepError(new UnsafeUrlError("내부망"))).toBeInstanceOf(FatalError);
    expect(toStepError(new LlmRefusalError("거절"))).toBeInstanceOf(FatalError);
    const login = toStepError(new FetchStatusError(403, "x")) as Error;
    expect(login).toBeInstanceOf(FatalError);
    expect(login.message).toContain("로그인");
    expect((toStepError(new FetchStatusError(404, "x")) as Error).message).toContain("찾을 수 없습니다");
  });
  it("maps a missing article row to a FatalError", () => {
    const e = toStepError(new ArticleNotFoundError("x")) as Error;
    expect(e).toBeInstanceOf(FatalError);
    expect(e.message).toBe("글이 삭제되었습니다");
  });
  it("keeps transient errors retryable", () => {
    const e = new FetchStatusError(503, "x");
    expect(toStepError(e)).toBe(e);
    const generic = new Error("network");
    expect(toStepError(generic)).toBe(generic);
  });
});

describe("userFacingMessage", () => {
  it("passes Korean messages through", () => {
    expect(userFacingMessage(new FatalError("본문 없음"))).toBe("본문 없음");
  });
  it("maps non-Korean errors and non-Error values to a generic Korean message", () => {
    const generic = "일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    expect(userFacingMessage(new TypeError("fetch failed"))).toBe(generic);
    expect(userFacingMessage("boom")).toBe(generic);
  });
});
