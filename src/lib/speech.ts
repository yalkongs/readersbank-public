import { inlineText, type Block } from "@/lib/blocks";
import { mathToSpeech } from "@/lib/math";

const MAX_LEN = 400;

export type SpeechSegment = { index: number; text: string };

function blockSpeechText(b: Block): string {
  switch (b.type) {
    case "heading":
      return b.text;
    case "paragraph":
    case "quote":
      return inlineText(b.text);
    case "list":
      return b.items
        .map((it) => inlineText(it).trim().replace(/[.。]$/, ""))
        .filter(Boolean)
        .join(". ");
    case "figure":
      return b.caption ?? "";
    default:
      return "";
  }
}

function splitLong(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_LEN) {
    const window = rest.slice(0, MAX_LEN + 1);
    let cut = -1;
    for (const m of window.matchAll(/(?:[.!?。！？]\s+|[。！？])/g)) {
      const end = m.index + m[0].length;
      if (end <= MAX_LEN) cut = end;
    }
    if (cut <= 0) cut = MAX_LEN;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function speechSegments(blocks: Block[]): SpeechSegment[] {
  const segs: SpeechSegment[] = [];
  blocks.forEach((b, index) => {
    const text = mathToSpeech(blockSpeechText(b)).trim();
    if (!text) return;
    for (const part of splitLong(text)) segs.push({ index, text: part });
  });
  return segs;
}

type VoiceLike = { lang: string; name: string; localService?: boolean };

export function pickVoice<T extends VoiceLike>(voices: T[]): T | null {
  const norm = (v: T) => v.lang.replace("_", "-").toLowerCase();
  const best = (xs: T[]) => xs.find((v) => v.localService) ?? xs[0] ?? null;
  return (
    best(voices.filter((v) => norm(v) === "ko-kr")) ?? best(voices.filter((v) => norm(v).startsWith("ko")))
  );
}
