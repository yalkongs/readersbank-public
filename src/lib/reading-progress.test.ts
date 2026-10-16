import { describe, expect, it } from "vitest";
import { inProgress, parseProgress, resumeBlock, updateProgress, type ProgressMap } from "@/lib/reading-progress";

const e = (o: Partial<{ title: string; block: number; pct: number; blocks: number; at: number }> = {}) => ({ title: "글", block: 10, pct: 0.4, blocks: 50, at: 1000, ...o });

describe("parseProgress", () => {
  it("ignores garbage and clamps values", () => {
    expect(parseProgress("not json")).toEqual({});
    expect(parseProgress('{"a":{"block":-3,"pct":2,"at":1,"title":"t","blocks":5}}')).toEqual({ a: { title: "t", block: 0, pct: 1, blocks: 5, at: 1, done: false } });
    expect(parseProgress('{"a":{"pct":0.5}}')).toEqual({});
  });
});

describe("updateProgress", () => {
  it("marks done at 95% and keeps done when scrolling back up", () => {
    let m: ProgressMap = {};
    m = updateProgress(m, "a", e({ pct: 0.97 }));
    expect(m.a.done).toBe(true);
    m = updateProgress(m, "a", e({ pct: 0.1 }));
    expect(m.a.done).toBe(true);
  });
  it("resets done when the article was reprocessed (block count changed)", () => {
    let m = updateProgress({}, "a", e({ pct: 0.99 }));
    m = updateProgress(m, "a", e({ pct: 0.2, blocks: 60 }));
    expect(m.a.done).toBe(false);
  });
  it("keeps at most 100 entries, newest first", () => {
    let m: ProgressMap = {};
    for (let i = 0; i < 105; i++) m = updateProgress(m, `s${i}`, e({ at: i }));
    expect(Object.keys(m)).toHaveLength(100);
    expect(m.s0).toBeUndefined();
  });
});

describe("resumeBlock / inProgress", () => {
  it("offers resume only for the same body, past the start, not finished", () => {
    expect(resumeBlock({ ...e(), done: false }, 50)).toBe(10);
    expect(resumeBlock({ ...e(), done: false }, 51)).toBeNull();
    expect(resumeBlock({ ...e({ block: 1 }), done: false }, 50)).toBeNull();
    expect(resumeBlock({ ...e(), done: true }, 50)).toBeNull();
    expect(resumeBlock(undefined, 50)).toBeNull();
  });
  it("lists recent unfinished articles", () => {
    const now = 40 * 24 * 3600 * 1000;
    const m: ProgressMap = {
      old: { ...e({ at: 1 }), done: false },
      fresh: { ...e({ at: now - 1000 }), done: false },
      done: { ...e({ at: now }), done: true },
      barely: { ...e({ at: now, pct: 0.01 }), done: false },
    };
    expect(inProgress(m, now).map((x) => x.slug)).toEqual(["fresh"]);
  });
});

describe("removeEntries", () => {
  it("drops the given slugs only", async () => {
    const { removeEntries } = await import("@/lib/reading-progress");
    const m = { a: { ...e(), done: false }, b: { ...e(), done: false } };
    expect(Object.keys(removeEntries(m, ["a", "zzz"]))).toEqual(["b"]);
  });
});
