// src/lib/articles/repo.test.ts
import { describe, expect, it } from "vitest";
import { makeSlug } from "@/lib/articles/repo";

describe("makeSlug", () => {
  it("uses UTC date and 6 random chars", () => {
    expect(makeSlug(new Date("2026-10-10T23:30:00Z"), () => 0)).toBe("20261010-aaaaaa");
  });
  it("only uses unambiguous lowercase chars and digits", () => {
    const slug = makeSlug(new Date("2026-01-02T00:00:00Z"));
    expect(slug).toMatch(/^20260102-[a-km-np-z2-9]{6}$/);
  });
});
