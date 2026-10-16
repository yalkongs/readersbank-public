import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { audioChars, listenBlocks, mergeCues, planAudioChunks, speechHash } from "./plan";

const p = (text: string): Block => ({ type: "paragraph", text: [{ text }] }) as Block;

describe("planAudioChunks", () => {
  it("makes one piece per block and packs pieces into chunks under the limit", () => {
    const chunks = planAudioChunks([p("가".repeat(30)), p("나".repeat(30)), p("다".repeat(30))], 70);
    expect(chunks.map((c) => c.pieces.map((x) => x.index))).toEqual([[0, 1], [2]]);
    expect(chunks[0].pieces[1].text).toBe("나".repeat(30));
    expect(audioChars(chunks)).toBe(90);
  });

  it("joins the sentences of one long block into pieces no longer than the piece limit", () => {
    const sentence = "가".repeat(300) + ".";
    const chunks = planAudioChunks([p(Array(5).fill(sentence).join(" "))], 10_000, 700);
    const pieces = chunks.flatMap((c) => c.pieces);
    expect(pieces.every((x) => x.index === 0 && x.text.length <= 700)).toBe(true);
    expect(pieces.length).toBe(3);
  });

  it("skips blocks with nothing to read", () => {
    expect(planAudioChunks([{ type: "figure", src: "https://x/y.png" } as Block])).toEqual([]);
  });
});

describe("mergeCues", () => {
  it("keeps only the first cue of consecutive pieces of the same block", () => {
    expect(mergeCues([[0, 0], [0, 5], [1, 9], [1, 12], [2, 20]])).toEqual([[0, 0], [1, 9], [2, 20]]);
  });
});

describe("speechHash / listenBlocks", () => {
  it("changes when the spoken text changes", () => {
    const a = speechHash(planAudioChunks([p("하나")]));
    expect(speechHash(planAudioChunks([p("하나")]))).toBe(a);
    expect(speechHash(planAudioChunks([p("둘")]))).not.toBe(a);
  });

  it("reads the translation for translatable articles and the original otherwise", () => {
    const ko = [p("번역")];
    const en = [p("original")];
    expect(listenBlocks({ lang: "en", bodyKo: ko, bodyOriginal: en })).toBe(ko);
    expect(listenBlocks({ lang: "ko", bodyKo: null, bodyOriginal: en })).toBe(en);
    expect(listenBlocks({ lang: "en", bodyKo: null, bodyOriginal: en })).toBe(en);
  });
});
