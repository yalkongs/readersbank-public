// 본문 텍스트 안의 LaTeX 수식($…$, $$…$$, \(…\), \[…\]) 찾기. 렌더링(KaTeX)은 서버에서만 한다(math-render.ts).
import type { Block, Inline } from "@/lib/blocks";

export type MathSeg = { kind: "text"; text: string } | { kind: "math"; display: boolean; tex: string; raw: string };
export type MathMap = Record<string, string>;

// 인라인 $…$는 여는 $ 뒤와 닫는 $ 앞이 공백이 아니고, 닫는 $ 뒤에 숫자가 오지 않을 때만 수식으로 본다
// ("$5 and $10", "$5-$10" 같은 금액 표기를 수식으로 오인하지 않기 위해).
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)((?:\\\$|[^$\n])+?)(?<=\S)\$(?!\d)/g;

export function splitMath(text: string): MathSeg[] {
  const out: MathSeg[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", text: text.slice(last, i) });
    const display = m[1] !== undefined || m[2] !== undefined;
    const tex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
    out.push({ kind: "math", display, tex, raw: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export const mathKey = (display: boolean, tex: string) => `${display ? "D" : "I"}:${tex}`;

// LaTeX 명령이나 \[ \( $$ 구분자가 하나라도 있어야 수식이 있는 글로 본다(금융 기사의 $만 있는 글은 건드리지 않음).
const TEX_HINT = /\\[a-zA-Z]+|\\\[|\\\(|\$\$|\$[^$\s][^$\n]*[\^_{}][^$\n]*\$/;

function blockTexts(b: Block): string[] {
  const inl = (xs: Inline[]) => xs.map((x) => x.text).join("");
  switch (b.type) {
    case "paragraph":
    case "quote":
      return [inl(b.text)];
    case "list":
      return b.items.map(inl);
    case "heading":
      return [b.text];
    case "figure":
      return b.caption ? [b.caption] : [];
    case "table":
      return b.rows.flat();
    default:
      return [];
  }
}

export function hasMath(blocks: Block[]): boolean {
  return blocks.some((b) => blockTexts(b).some((t) => TEX_HINT.test(t)));
}

export function collectMath(blocks: Block[]): { display: boolean; tex: string }[] {
  const seen = new Map<string, { display: boolean; tex: string }>();
  for (const b of blocks) {
    for (const t of blockTexts(b)) {
      for (const s of splitMath(t)) if (s.kind === "math") seen.set(mathKey(s.display, s.tex), { display: s.display, tex: s.tex });
    }
  }
  return [...seen.values()];
}

// 듣기용: 긴 수식이나 블록 수식은 "수식"으로, 짧은 인라인 수식은 기호만 남겨 읽는다.
export function mathToSpeech(text: string): string {
  if (!TEX_HINT.test(text)) return text;
  return splitMath(text)
    .map((s) => {
      if (s.kind === "text") return s.text;
      if (s.display) return " 수식 ";
      const plain = s.tex
        .replace(/\\times/g, "×")
        .replace(/\\(cdot|,|;|!|quad|qquad)/g, " ")
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/[{}\\]/g, "")
        .replace(/[\^_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return plain && plain.length <= 16 ? plain : " 수식 ";
    })
    .join("")
    .replace(/\s{2,}/g, " ");
}
