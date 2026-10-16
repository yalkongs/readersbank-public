import { finalizeAudioStep, markAudioFailedStep, planAudioStep, synthChunkStep, type AudioPart } from "./audio-steps";
import { userFacingMessage } from "./step-errors";

// 동시에 합성하는 조각 수. 조각 안의 블록은 차례로 합성하므로 동시 요청도 이 수만큼이다.
export const AUDIO_PARALLEL = 4;

// 글 본문을 OpenAI TTS로 낭독해 MP3 하나로 저장한다. run은 이 실행의 시작 시각(ms)으로, 다시 시작하면 이전 실행 결과는 버린다.
export async function generateAudio(articleId: string, run: number): Promise<{ status: "done" }> {
  "use workflow";
  try {
    const { hash, chunks } = await planAudioStep(articleId);
    const parts: AudioPart[] = [];
    for (let start = 0; start < chunks.length; start += AUDIO_PARALLEL) {
      const group = chunks.slice(start, start + AUDIO_PARALLEL);
      const out = await Promise.all(
        group.map((chunk, k) => synthChunkStep(articleId, run, start + k, chunks.length, chunk)),
      );
      parts.push(...out);
    }
    await finalizeAudioStep(articleId, run, hash, parts);
    return { status: "done" };
  } catch (e) {
    await markAudioFailedStep(articleId, run, userFacingMessage(e));
    throw e;
  }
}
