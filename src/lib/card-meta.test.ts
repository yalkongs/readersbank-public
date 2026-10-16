import { describe, expect, it } from "vitest";
import { absoluteDate, relativeDate, sourceDomain } from "@/lib/card-meta";

// 2026-10-15 22:00 KST
const now = Date.parse("2026-10-15T13:00:00Z");

describe("relativeDate", () => {
  it("counts days in Korean time", () => {
    expect(relativeDate(new Date("2026-10-14T15:30:00Z"), now)).toBe("오늘"); // 10/15 00:30 KST
    expect(relativeDate(new Date("2026-10-14T14:30:00Z"), now)).toBe("어제"); // 10/14 23:30 KST
    expect(relativeDate(new Date("2026-10-12T01:00:00Z"), now)).toBe("3일 전");
    expect(relativeDate(new Date("2026-10-01T01:00:00Z"), now)).toBe("10월 1일");
    expect(relativeDate(new Date("2025-12-31T16:00:00Z"), now)).toBe("1월 1일");
    expect(relativeDate(new Date("2025-06-01T01:00:00Z"), now)).toBe("2025년 6월 1일");
    expect(relativeDate(new Date("2026-10-16T01:00:00Z"), now)).toBe("오늘");
  });
  it("absoluteDate omits the current year", () => {
    expect(absoluteDate(new Date("2026-10-14T15:30:00Z"), now)).toBe("10월 15일");
  });
});

describe("sourceDomain", () => {
  it("returns the host without www", () => {
    expect(sourceDomain("https://www.stateof.ai/2026")).toBe("stateof.ai");
    expect(sourceDomain("https://medium.com/@a/b")).toBe("medium.com");
    expect(sourceDomain("https://kaz-ataka.hatenablog.com/entry/1")).toBe("kaz-ataka");
    expect(sourceDomain("https://nathanbenaich.substack.com/p/x")).toBe("nathanbenaich");
    expect(sourceDomain("https://a.b.github.io/x")).toBe("a.b.github.io");
    expect(sourceDomain("https://substack.com/home")).toBe("substack.com");
    expect(sourceDomain(null)).toBeNull();
    expect(sourceDomain("javascript:alert(1)")).toBeNull();
    expect(sourceDomain("not a url")).toBeNull();
  });
});
