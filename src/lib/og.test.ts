import { describe, expect, it } from "vitest";
import { clamp, prefersPortraitPreview, prepareOgText, shareImageVersion, supportedCoverType } from "@/lib/og";

describe("clamp", () => {
  it("짧으면 그대로(공백 정리만)", () => {
    expect(clamp("  안녕   세상 ", 20)).toBe("안녕 세상");
  });
  it("단어 경계에서 자르고 말줄임표를 붙인다", () => {
    expect(clamp("윈도우와 맥 키보드 무엇이 다를까", 14)).toBe("윈도우와 맥 키보드…");
  });
  it("정확히 경계면 단어를 살린다", () => {
    expect(clamp("aaa bbb ccc", 8)).toBe("aaa bbb…");
  });
  it("공백 없는 긴 단어는 글자 단위로 자른다", () => {
    expect(clamp("abcdefghij", 5)).toBe("abcd…");
  });
  it("끝 구두점은 말줄임표 앞에서 제거", () => {
    expect(clamp("hello, world foo", 9)).toBe("hello…");
  });
  it("상한 0 이하는 빈 문자열", () => {
    expect(clamp("abc", 0)).toBe("");
  });
  it("이모지 등 서로게이트 쌍을 깨지 않는다", () => {
    expect(clamp("😀😀😀😀😀😀", 4)).toBe("😀😀😀…");
  });
});

describe("prepareOgText", () => {
  const a = { titleKo: null, titleOriginal: "Orig", leadKo: " ", summaryKo: ["a", " ", "b", "c", "d"] };
  it("제목은 ko 우선, 없으면 원제", () => {
    expect(prepareOgText(a, "portrait").title).toBe("Orig");
    expect(prepareOgText({ ...a, titleKo: "한글" }, "portrait").title).toBe("한글");
  });
  it("빈 리드는 null, 요약은 빈 항목 제외 후 3개", () => {
    const t = prepareOgText(a, "portrait");
    expect(t.lead).toBeNull();
    expect(t.summary).toEqual(["a", "b", "c"]);
  });
  it("가로형은 요약을 쓰지 않는다", () => {
    expect(prepareOgText(a, "landscape").summary).toEqual([]);
  });
});

describe("supportedCoverType", () => {
  it("png/jpeg/webp/avif만 허용", () => {
    expect(supportedCoverType("image/png")).toBe("image/png");
    expect(supportedCoverType("image/jpeg; charset=x")).toBe("image/jpeg");
    expect(supportedCoverType("image/avif")).toBe("image/avif");
    expect(supportedCoverType("image/svg+xml")).toBeNull();
    expect(supportedCoverType(null)).toBeNull();
  });
});

describe("share preview helpers", () => {
  it("detects Telegram's preview bot", () => {
    expect(prefersPortraitPreview("TelegramBot (like TwitterBot)")).toBe(true);
    expect(prefersPortraitPreview("Twitterbot/1.0")).toBe(false);
    expect(prefersPortraitPreview(null)).toBe(false);
  });
  it("changes the wide image version when the card content changes", () => {
    const a = { titleKo: "제목", leadKo: "소개", coverImage: null };
    expect(shareImageVersion(a)).toBe(shareImageVersion({ ...a }));
    expect(shareImageVersion(a)).not.toBe(shareImageVersion({ ...a, titleKo: "새 제목" }));
  });
});
