import { describe, expect, it } from "vitest";
import { hangulRatio, isTranslatable, quickLang } from "@/lib/lang";

describe("quickLang", () => {
  it("plain korean is ko", () => {
    expect(quickLang("오늘은 날씨가 맑고 바람이 조금 붑니다. 산책하기 좋은 날입니다.")).toBe("ko");
  });
  it("korean text with many english terms is ko", () => {
    const text =
      "이번 릴리스에서는 React Server Components와 Suspense, streaming SSR, Partial Prerendering을 지원합니다. " +
      "Next.js App Router에서 use cache 지시어로 cacheLife와 cacheTag를 설정할 수 있습니다.";
    expect(hangulRatio(text)).toBeGreaterThanOrEqual(0.3);
    expect(quickLang(text)).toBe("ko");
  });
  it("english is unknown (decided by LLM)", () => {
    expect(quickLang("The quick brown fox jumps over the lazy dog.")).toBe("unknown");
  });
  it("japanese/chinese/russian text with a few hangul words is not ko", () => {
    expect(quickLang("AI時代に起きる最大の悲劇は仕事を奪われることじゃなく、夢がたった二十分で叶ってしまうことなんよな。".repeat(5) + " 설명")).toBe("unknown");
    expect(quickLang("人工智能正在改变我们的工作方式和生活方式。".repeat(5) + " 참고")).toBe("unknown");
    expect(quickLang("Искусственный интеллект меняет нашу жизнь и работу каждый день. " + "요약")).toBe("unknown");
  });
  it("korean with some hanja is still ko", () => {
    expect(quickLang("생산性은 결국 사람이 무엇에 집중하느냐의 문제다. 도구는 거들 뿐이다.")).toBe("ko");
  });
  it("empty text is unknown", () => {
    expect(quickLang("   ")).toBe("unknown");
  });
});

describe("isTranslatable", () => {
  it("is true for every two-letter code except ko", () => {
    expect(["en", "ja", "zh", "fr"].every(isTranslatable)).toBe(true);
    expect([null, undefined, "", "ko", "unknown", "EN"].some(isTranslatable)).toBe(false);
  });
});
