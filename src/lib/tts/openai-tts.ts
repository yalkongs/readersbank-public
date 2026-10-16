// OpenAI 음성 합성. 타임스탬프를 주지 않으므로 블록(문단)마다 따로 합성하고, 조각 길이(MP3 프레임 수)로 시작 시각을 잡는다.
import OpenAI, { APIError } from "openai";

export const TTS_MODEL = "gpt-4o-mini-tts";
// 기본 목소리. OPENAI_TTS_VOICE로 바꿀 수 있다(alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar 등).
export const DEFAULT_VOICE = "cedar";
const INSTRUCTIONS = "한국어 기사를 낭독한다. 차분하고 또렷하게, 뉴스 내레이션처럼 자연스러운 속도와 억양으로 읽는다.";

export class TtsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function ttsVoice(): string {
  return process.env.OPENAI_TTS_VOICE?.trim() || DEFAULT_VOICE;
}

// 실패를 사용자에게 보여 줄 문장으로 바꾼다. 일시적인 실패(429 한도·5xx·연결)만 다시 시도한다.
function toTtsError(e: unknown): unknown {
  if (!(e instanceof APIError)) return e;
  const status = e.status ?? 0;
  if (e.code === "insufficient_quota") return new TtsError("OpenAI 사용 한도(크레딧)를 넘었어요. 결제·한도를 확인해 주세요.", false);
  if (status === 401 || status === 403) return new TtsError("OpenAI 키가 올바르지 않거나 음성 합성 권한이 없어요.", false);
  if (status === 429 || status >= 500 || status === 0) return new TtsError(`OpenAI 일시 오류(${status || "연결"})`, true);
  return new TtsError(`OpenAI가 요청을 거절했어요(${status}${e.code ? `, ${e.code}` : ""}).`, false);
}

export async function synthesize(text: string): Promise<Uint8Array> {
  if (!process.env.OPENAI_API_KEY) throw new TtsError("음성 합성 키(OPENAI_API_KEY)가 설정되지 않았어요.", false);
  try {
    const res = await new OpenAI({ maxRetries: 1, timeout: 120_000 }).audio.speech.create({
      model: TTS_MODEL,
      voice: ttsVoice(),
      input: text,
      instructions: INSTRUCTIONS,
      response_format: "mp3",
    });
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    throw toTtsError(e);
  }
}
