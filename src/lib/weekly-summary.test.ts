import { describe, expect, it } from "vitest";
import { formatWeekly } from "@/lib/weekly-summary";

describe("formatWeekly", () => {
  it("omits failures when there are none", () => {
    expect(formatWeekly(5, 0, 0.456)).toBe("새 글 5편 · 추정 비용 $0.46");
    expect(formatWeekly(2, 1, 0)).toBe("새 글 2편 · 실패 1건 · 추정 비용 $0.00");
  });
});
