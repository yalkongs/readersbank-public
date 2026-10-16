import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/blocks";
import { collectMath, hasMath, mathToSpeech, splitMath } from "@/lib/math";
import { renderMathMap } from "@/lib/math-render";

const p = (text: string): Block => ({ type: "paragraph", text: [{ text }] });

describe("splitMath", () => {
  it("finds inline and display math with all four delimiters", () => {
    const segs = splitMath("점 $x \\in \\mathbb{R}^{784}$ 와\n \\[ f(x)=\\sum_i a_i \\]\n그리고 \\(a\\) $$b$$");
    expect(segs.filter((s) => s.kind === "math")).toEqual([
      { kind: "math", display: false, tex: "x \\in \\mathbb{R}^{784}", raw: "$x \\in \\mathbb{R}^{784}$" },
      { kind: "math", display: true, tex: "f(x)=\\sum_i a_i", raw: "\\[ f(x)=\\sum_i a_i \\]" },
      { kind: "math", display: false, tex: "a", raw: "\\(a\\)" },
      { kind: "math", display: true, tex: "b", raw: "$$b$$" },
    ]);
    expect(segs.map((s) => (s.kind === "text" ? s.text : s.raw)).join("")).toBe("점 $x \\in \\mathbb{R}^{784}$ 와\n \\[ f(x)=\\sum_i a_i \\]\n그리고 \\(a\\) $$b$$");
  });
  it("does not treat dollar amounts as math", () => {
    for (const t of ["costs $5 and $10", "$5-$10 range", "pay $ 5 now $"]) {
      expect(splitMath(t).every((s) => s.kind === "text")).toBe(true);
    }
  });
});

describe("hasMath / collectMath", () => {
  it("needs a TeX hint so finance articles are untouched", () => {
    expect(hasMath([p("price went from $5 to $7")])).toBe(false);
    expect(hasMath([p("오차 $n^{-1/2}$")])).toBe(true);
    expect(hasMath([p("\\[ a \\]")])).toBe(true);
  });
  it("dedupes formulas", () => {
    expect(collectMath([p("$n$ 그리고 $n$ 와 $m$")])).toHaveLength(2);
  });
});

describe("renderMathMap", () => {
  it("renders KaTeX HTML server-side, skips unparsable tex and untrusted commands", () => {
    const map = renderMathMap([p("$\\sigma(b_i \\cdot x)$ 와 $\\frac{1$ 와 $\\href{javascript:alert(1)}{x}$ \\[ \\sum_i a_i \\]")]);
    expect(map["I:\\sigma(b_i \\cdot x)"]).toContain('class="katex"');
    expect(map["D:\\sum_i a_i"]).toContain("katex-display");
    expect(map["I:\\frac{1"]).toBeUndefined();
    // 신뢰하지 않는 \href는 링크가 되지 않고 빨간 글자로만 그려진다(원문 TeX는 주석 안에만 남음).
    const href = map["I:\\href{javascript:alert(1)}{x}"];
    expect(href).not.toMatch(/<a\b|href=/);
  });
  it("returns an empty map when there is no math", () => {
    expect(renderMathMap([p("$5 and $10")])).toEqual({});
  });
});

describe("mathToSpeech", () => {
  it("reads short inline math as symbols and replaces display/long math", () => {
    expect(mathToSpeech("$28 \\times 28$ 화소")).toBe("28 × 28 화소");
    expect(mathToSpeech("식 \\[ f_n(x) = \\sum_{i=1}^{n} a_i \\sigma(b_i \\cdot x + c_i) \\] 이다")).toBe("식 수식 이다");
    expect(mathToSpeech("plain $5 text")).toBe("plain $5 text");
  });
});
