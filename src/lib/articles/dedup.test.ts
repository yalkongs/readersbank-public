import { describe, expect, it } from "vitest";
import { duplicateResponse } from "@/lib/articles/dedup";

describe("duplicateResponse", () => {
  it("returns null when there is no existing article", () => {
    expect(duplicateResponse(null)).toBeNull();
  });
  it("returns 409 with slug for a published article", () => {
    expect(duplicateResponse({ slug: "s1", status: "published" })).toEqual({
      status: 409,
      body: { error: "이미 등록된 URL입니다", slug: "s1" },
    });
  });
  it.each(["queued", "processing"] as const)("returns 409 without slug while %s", (status) => {
    const r = duplicateResponse({ slug: "s1", status });
    expect(r).toEqual({ status: 409, body: { error: "이미 처리 중인 URL입니다" } });
    expect(r?.body).not.toHaveProperty("slug");
  });
});
