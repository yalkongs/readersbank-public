import { describe, expect, it } from "vitest";
import { cueAt } from "./ListenButton";

describe("cueAt", () => {
  const cues: [number, number][] = [[0, 0], [2, 4.5], [5, 9]];
  it("returns the block being read at a playback position", () => {
    expect(cueAt(cues, 0)).toBe(0);
    expect(cueAt(cues, 4.49)).toBe(0);
    expect(cueAt(cues, 4.5)).toBe(2);
    expect(cueAt(cues, 100)).toBe(5);
  });
  it("returns null before the first cue or with no cues", () => {
    expect(cueAt([[1, 2]], 1)).toBeNull();
    expect(cueAt([], 3)).toBeNull();
  });
});
