// 글 본문을 오디오 조각으로 나눈다. 읽기 화면의 브라우저 음성 읽기와 같은 문장 단위(speechSegments)를 쓰고,
// 같은 블록의 문장은 한 번에 합성한다. 블록마다 따로 합성하므로 각 블록의 시작 시각을 오디오 길이로 정확히 알 수 있다.
import { createHash } from "node:crypto";
import type { Article } from "@/db/schema";
import type { Block } from "@/lib/blocks";
import { isTranslatable } from "@/lib/lang";
import { speechSegments } from "@/lib/speech";

// 조각 하나(워크플로 한 단계)의 글자 수 상한. 한 단계가 금방 끝나게 작게 잡는다.
export const AUDIO_CHUNK_CHARS = 2500;
// 한 번에 합성하는 글자 수 상한(모델 입력 한도보다 충분히 작게).
export const AUDIO_PIECE_CHARS = 1000;

// 한 번의 합성 요청. index는 블록 번호.
export type AudioPiece = { index: number; text: string };
export type AudioChunk = { pieces: AudioPiece[] };
// [블록 번호, 시작 초]. 같은 블록이 이어지면 첫 시작만 남긴다.
export type AudioCue = [number, number];

/** 읽기 화면이 보여 주는 본문(번역이 있으면 번역, 없으면 원문). */
export function listenBlocks(a: Pick<Article, "lang" | "bodyKo" | "bodyOriginal">): Block[] {
  return isTranslatable(a.lang) && a.bodyKo != null ? a.bodyKo : (a.bodyOriginal ?? []);
}

const chunkChars = (c: AudioChunk) => c.pieces.reduce((n, p) => n + p.text.length, 0);

export function planAudioChunks(blocks: Block[], max = AUDIO_CHUNK_CHARS, pieceMax = AUDIO_PIECE_CHARS): AudioChunk[] {
  const pieces: AudioPiece[] = [];
  for (const seg of speechSegments(blocks)) {
    const last = pieces[pieces.length - 1];
    if (last && last.index === seg.index && last.text.length + 1 + seg.text.length <= pieceMax) last.text += " " + seg.text;
    else pieces.push({ index: seg.index, text: seg.text });
  }
  const chunks: AudioChunk[] = [];
  let cur: AudioChunk | null = null;
  for (const p of pieces) {
    if (cur && chunkChars(cur) + p.text.length > max) {
      chunks.push(cur);
      cur = null;
    }
    if (!cur) cur = { pieces: [] };
    cur.pieces.push(p);
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function audioChars(chunks: AudioChunk[]): number {
  return chunks.reduce((n, c) => n + chunkChars(c), 0);
}

/** 오디오를 만든 본문과 지금 본문이 같은지 가리는 지문. 다시 처리·편집으로 본문이 바뀌면 달라진다. */
export function speechHash(chunks: AudioChunk[]): string {
  const h = createHash("sha256");
  for (const c of chunks) for (const p of c.pieces) h.update(String(p.index)).update("\u0001").update(p.text).update("\u0000");
  return h.digest("hex").slice(0, 16);
}

export function mergeCues(cues: AudioCue[]): AudioCue[] {
  const out: AudioCue[] = [];
  for (const c of cues) if (out.length === 0 || out[out.length - 1][0] !== c[0]) out.push(c);
  return out;
}
