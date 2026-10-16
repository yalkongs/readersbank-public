import { describe, expect, it } from "vitest";
import { audioFrames, concatFrames } from "./mp3";

// MPEG1 Layer III, 64kbps, 44.1kHz, 모노, 패딩 없음 → 프레임 208바이트, 1152샘플.
const FRAME = 208;
function frame(fill: number, info = false): Uint8Array {
  const f = new Uint8Array(FRAME).fill(fill);
  f.set([0xff, 0xfb, 0x50, 0xc0]);
  if (info) f.set([0x49, 0x6e, 0x66, 0x6f], 4 + 17); // "Info"
  return f;
}
function id3(): Uint8Array {
  return new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
}

describe("audioFrames", () => {
  it("drops the ID3 tag and the leading Info frame, and counts duration by frames", () => {
    const input = concatFrames([id3(), frame(0, true), frame(1), frame(2), frame(3)]);
    const { data, seconds } = audioFrames(input);
    expect(data.length).toBe(FRAME * 3);
    expect(data[4]).toBe(1);
    expect(seconds).toBeCloseTo((3 * 1152) / 44100, 6);
  });

  it("keeps the first frame when it is ordinary audio", () => {
    const { data, seconds } = audioFrames(concatFrames([frame(7), frame(8)]));
    expect(data.length).toBe(FRAME * 2);
    expect(seconds).toBeCloseTo((2 * 1152) / 44100, 6);
  });

  it("handles MPEG2 24kHz frames (OpenAI TTS output)", () => {
    // MPEG2 Layer III, 128kbps, 24kHz, 모노 → 프레임 384바이트, 576샘플.
    const f = new Uint8Array(384);
    f.set([0xff, 0xf3, 0xc4, 0xc4]);
    const { data, seconds } = audioFrames(concatFrames([f, f, f, f]));
    expect(data.length).toBe(384 * 4);
    expect(seconds).toBeCloseTo((4 * 576) / 24000, 6);
  });

  it("returns nothing for non-MP3 input", () => {
    expect(audioFrames(new Uint8Array([1, 2, 3, 4, 5])).seconds).toBe(0);
  });
});
