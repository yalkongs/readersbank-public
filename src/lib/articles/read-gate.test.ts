import { describe, expect, it } from "vitest";
import { canRead } from "@/lib/articles/read-gate";

describe("canRead", () => {
  it.each([
    [true, true, true],
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])("isPublic=%s tokenValid=%s -> %s", (isPublic, tokenValid, expected) => {
    expect(canRead({ isPublic }, tokenValid)).toBe(expected);
  });
});
