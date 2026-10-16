import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, escapeLike, normalizeQuery } from "@/lib/articles/listing";

describe("escapeLike", () => {
  it("escapes wildcards and backslash", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\x")).toBe("c:\\\\x");
    expect(escapeLike("한글 검색")).toBe("한글 검색");
  });
});

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("cursor", () => {
  it("round-trips", () => {
    const d = new Date("2026-10-10T12:00:00.000Z");
    const c = encodeCursor(d, UUID);
    expect(decodeCursor(c)).toEqual({ publishedAt: d, id: UUID });
  });
  it("rejects non-uuid id and out-of-range dates", () => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    expect(decodeCursor(enc(["2026-10-10T12:00:00.000Z", "x"]))).toBeNull();
    expect(decodeCursor(enc(["+275760-09-13T00:00:00.000Z", UUID]))).toBeNull();
    expect(decodeCursor(enc(["1999-12-31T00:00:00.000Z", UUID]))).toBeNull();
  });
  it.each([null, undefined, "", "!!!", Buffer.from("{}").toString("base64url"), Buffer.from('["not-a-date","x"]').toString("base64url"), Buffer.from('[1,2,3]').toString("base64url")])(
    "invalid %s → null",
    (c) => expect(decodeCursor(c as string)).toBeNull(),
  );
});

describe("normalizeQuery", () => {
  it("trims, nulls empty, caps length", () => {
    expect(normalizeQuery("  hi ")).toBe("hi");
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
    expect(normalizeQuery("x".repeat(150))).toHaveLength(100);
  });
});
