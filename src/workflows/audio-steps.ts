import { del, list, put } from "@vercel/blob";
import { FatalError } from "workflow";
import { isArticleOwnedBlob } from "@/lib/articles/admin-ops";
import { requireArticle, updateArticle } from "@/lib/articles/repo";
import { TTS_MODEL, TtsError, synthesize, ttsVoice } from "@/lib/tts/openai-tts";
import { audioFrames, concatFrames } from "@/lib/tts/mp3";
import { listenBlocks, mergeCues, planAudioChunks, speechHash, type AudioChunk, type AudioCue } from "@/lib/tts/plan";
import { toStepError } from "./step-errors";

export type AudioPlan = { hash: string; chunks: AudioChunk[] };
export type AudioPart = { url: string; seconds: number; cues: AudioCue[]; chars: number };

// 오디오 파일도 글 이미지 폴더(images/{id}/) 아래에 둔다 — 글을 지울 때 함께 지워지고 소유 확인도 같은 규칙을 쓴다.
const partsPrefix = (articleId: string, run: number) => `images/${articleId}/audio-parts/${run}-`;

async function loadArticle(articleId: string) {
  try {
    return await requireArticle(articleId);
  } catch (e) {
    throw toStepError(e);
  }
}

// 이 실행이 아직 유효한지(그사이 다시 시작하거나 지우지 않았는지).
function isCurrentRun(a: { audioStatus: string | null; audioStartedAt: Date | null }, run: number): boolean {
  return a.audioStatus === "generating" && a.audioStartedAt?.getTime() === run;
}

async function deleteParts(articleId: string, run: number): Promise<void> {
  try {
    const { blobs } = await list({ prefix: partsPrefix(articleId, run) });
    if (blobs.length) await del(blobs.map((b) => b.url));
  } catch (e) {
    console.error("[audio] 조각 파일 정리 실패", e instanceof Error ? e.message : e);
  }
}

export async function planAudioStep(articleId: string): Promise<AudioPlan> {
  "use step";
  const a = await loadArticle(articleId);
  const chunks = planAudioChunks(listenBlocks(a));
  if (chunks.length === 0) throw new FatalError("읽을 본문이 없어요.");
  return { hash: speechHash(chunks), chunks };
}

export async function synthChunkStep(articleId: string, run: number, i: number, total: number, chunk: AudioChunk): Promise<AudioPart> {
  "use step";
  // 그사이 취소·다시 시작했으면 비용을 더 쓰지 않고 멈춘다.
  if (!isCurrentRun(await loadArticle(articleId), run)) throw new FatalError("오디오 생성이 취소되었어요.");
  // 블록마다 따로 합성한다. 각 블록의 시작 시각 = 앞 블록들의 재생 시간 합.
  const frames: Uint8Array[] = [];
  const cues: AudioCue[] = [];
  let seconds = 0;
  for (const piece of chunk.pieces) {
    let audio: Uint8Array;
    try {
      audio = await synthesize(piece.text);
    } catch (e) {
      if (e instanceof TtsError && !e.retryable) throw new FatalError(e.message);
      throw e;
    }
    const f = audioFrames(audio);
    if (f.data.length === 0) throw new Error("빈 오디오 조각");
    cues.push([piece.index, Math.round(seconds * 100) / 100]);
    frames.push(f.data);
    seconds += f.seconds;
  }
  // 다시 시도해도 같은 이름에 덮어쓴다.
  const blob = await put(`${partsPrefix(articleId, run)}${String(i).padStart(4, "0")}.mp3`, Buffer.from(concatFrames(frames)), {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  await updateArticle(articleId, { audioProgress: `낭독 만드는 중 (${i + 1}/${total})` });
  return { url: blob.url, seconds, cues, chars: chunk.pieces.reduce((n, p) => n + p.text.length, 0) };
}

export async function finalizeAudioStep(articleId: string, run: number, hash: string, parts: AudioPart[]): Promise<void> {
  "use step";
  const a = await loadArticle(articleId);
  if (!isCurrentRun(a, run)) {
    await deleteParts(articleId, run);
    return;
  }
  const bytes: Uint8Array[] = [];
  const cues: AudioCue[] = [];
  let offset = 0;
  for (const p of parts) {
    const res = await fetch(p.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`오디오 조각을 읽지 못함 (${res.status})`);
    bytes.push(new Uint8Array(await res.arrayBuffer()));
    for (const [index, t] of p.cues) cues.push([index, Math.round((t + offset) * 100) / 100]);
    offset += p.seconds;
  }
  const blob = await put(`images/${articleId}/audio.mp3`, Buffer.from(concatFrames(bytes)), {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: true,
    multipart: true,
  });
  const previous = a.audioUrl;
  await updateArticle(articleId, {
    audioUrl: blob.url,
    audioMeta: {
      hash,
      chars: parts.reduce((n, p) => n + p.chars, 0),
      seconds: Math.round(offset),
      voiceId: ttsVoice(),
      model: TTS_MODEL,
      cues: mergeCues(cues),
    },
    audioStatus: null,
    audioProgress: null,
    audioError: null,
  });
  if (previous && isArticleOwnedBlob(previous, articleId)) {
    await del(previous).catch((e) => console.error("[audio] 이전 오디오 삭제 실패", e instanceof Error ? e.message : e));
  }
  await deleteParts(articleId, run);
}

export async function markAudioFailedStep(articleId: string, run: number, message: string): Promise<void> {
  "use step";
  let a;
  try {
    a = await requireArticle(articleId);
  } catch {
    return; // 글이 지워졌으면 남길 상태도 없다
  }
  if (isCurrentRun(a, run)) await updateArticle(articleId, { audioStatus: "failed", audioProgress: null, audioError: message });
  await deleteParts(articleId, run);
}
