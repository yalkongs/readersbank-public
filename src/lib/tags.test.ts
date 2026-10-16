import { describe, expect, it } from "vitest";
import { mergeTagInput } from "@/lib/tags";

describe("mergeTagInput", () => {
  it("adds every comma-separated tag from a paste", () => {
    expect(mergeTagInput([], "a,b,", 6)).toEqual({ tags: ["a", "b"], hint: null });
    expect(mergeTagInput(["x"], " a , b , c", 6)).toEqual({ tags: ["x", "a", "b", "c"], hint: null });
  });
  it("dedupes case-insensitively against existing and within the input", () => {
    expect(mergeTagInput(["AI"], "ai,경제,경제", 6)).toEqual({ tags: ["AI", "경제"], hint: "이미 있는 태그예요" });
  });
  it("caps at max across the combined list", () => {
    expect(mergeTagInput(["a", "b", "c", "d", "e"], "f,g,h", 6)).toEqual({ tags: ["a", "b", "c", "d", "e", "f"], hint: "태그는 6개까지 붙일 수 있어요" });
  });
  it("ignores blank input", () => {
    expect(mergeTagInput(["a"], " , ", 6)).toEqual({ tags: ["a"], hint: null });
  });
});
