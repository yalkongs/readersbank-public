// TTS가 돌려주는 MP3 조각을 이어 붙인다. 조각 앞에 ID3 태그나 LAME "Info" 프레임(그 조각의 총 프레임 수)이 붙어 있으면
// 그대로 이어 붙였을 때 브라우저가 첫 조각 길이만큼만 재생 시간을 잡으므로, 둘 다 떼고 오디오 프레임만 잇는다.

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES_V1 = [44100, 48000, 32000];

type Frame = { length: number; samples: number; sampleRate: number; sideInfo: number };

// MPEG Layer III 프레임 헤더만 해석한다(TTS의 mp3 출력은 Layer III. OpenAI는 MPEG2 24kHz).
function parseHeader(b: Uint8Array, o: number): Frame | null {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[o + 1] >> 3) & 3; // 3: MPEG1, 2: MPEG2, 0: MPEG2.5
  const layer = (b[o + 1] >> 1) & 3;
  if (version === 1 || layer !== 1) return null;
  const bi = b[o + 2] >> 4;
  const si = (b[o + 2] >> 2) & 3;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const v1 = version === 3;
  const bitrate = (v1 ? BITRATES_V1 : BITRATES_V2)[bi] * 1000;
  const sampleRate = RATES_V1[si] / (v1 ? 1 : version === 2 ? 2 : 4);
  const padding = (b[o + 2] >> 1) & 1;
  const mono = b[o + 3] >> 6 === 3;
  const samples = v1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  const sideInfo = v1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return { length, samples, sampleRate, sideInfo };
}

function id3Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0; // "ID3"
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  return 10 + size + (b[5] & 0x10 ? 10 : 0);
}

function isInfoFrame(b: Uint8Array, o: number, f: Frame): boolean {
  const p = o + 4 + f.sideInfo;
  const tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  return tag === "Xing" || tag === "Info";
}

/** ID3·Info 프레임을 떼고 오디오 프레임만 남긴다. 재생 시간은 프레임 수로 정확히 센다. */
export function audioFrames(input: Uint8Array): { data: Uint8Array; seconds: number } {
  let o = id3Size(input);
  let seconds = 0;
  const kept: [number, number][] = [];
  let first = true;
  while (o < input.length) {
    const f = parseHeader(input, o);
    if (!f || f.length <= 0) {
      o++; // 프레임 경계를 다시 찾는다(끝의 쓰레기 바이트 등)
      continue;
    }
    if (!(first && isInfoFrame(input, o, f))) {
      kept.push([o, Math.min(o + f.length, input.length)]);
      seconds += f.samples / f.sampleRate;
    }
    first = false;
    o += f.length;
  }
  if (kept.length === 0) return { data: new Uint8Array(0), seconds: 0 };
  const total = kept.reduce((n, [s, e]) => n + e - s, 0);
  const data = new Uint8Array(total);
  let w = 0;
  for (const [s, e] of kept) {
    data.set(input.subarray(s, e), w);
    w += e - s;
  }
  return { data, seconds };
}

export function concatFrames(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let w = 0;
  for (const p of parts) {
    out.set(p, w);
    w += p.length;
  }
  return out;
}
