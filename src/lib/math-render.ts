import katex from "katex";
import type { Block } from "@/lib/blocks";
import { collectMath, hasMath, mathKey, type MathMap } from "@/lib/math";

// 글에 나오는 수식을 서버에서 KaTeX HTML로 미리 만든다. 클라이언트는 이 표만 받아 끼워 넣는다.
// trust를 끈 기본 설정이라 \href·\url·\htmlClass 같은 명령은 그려지지 않고, 해석 실패는 원문 표기로 남긴다.
export function renderMathMap(...bodies: (Block[] | null | undefined)[]): MathMap {
  const blocks = bodies.flatMap((b) => b ?? []);
  if (!hasMath(blocks)) return {};
  const map: MathMap = {};
  for (const { display, tex } of collectMath(blocks)) {
    try {
      map[mathKey(display, tex)] = katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore", output: "htmlAndMathml" });
    } catch {
      // 해석할 수 없는 수식은 표에 넣지 않아 원문 그대로 보인다.
    }
  }
  return map;
}
