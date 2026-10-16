import { safeHref, type Block, type Inline } from "@/lib/blocks";
import { splitMath } from "@/lib/math";
import { SHORT_MIN_CHARS, type ExtractResult } from "./types";

// 마크다운 강조·링크를 해석한다. 수식($…$, \[…\] 등) 안의 *·_·[ ]는 서식이 아니므로 건드리지 않는다.
export function parseInline(s: string): Inline[] {
  const segs = splitMath(s);
  if (!segs.some((x) => x.kind === "math")) return parseMarkdown(s);
  const out: Inline[] = [];
  for (const seg of segs) {
    if (seg.kind === "math") out.push({ text: seg.raw });
    else out.push(...parseMarkdown(seg.text));
  }
  // 수식 앞뒤로 나뉜 서식 없는 조각은 다시 하나로 합친다.
  return out.reduce<Inline[]>((acc, it) => {
    const prev = acc[acc.length - 1];
    if (prev && Object.keys(prev).length === 1 && Object.keys(it).length === 1) prev.text += it.text;
    else acc.push({ ...it });
    return acc;
  }, []);
}

function parseMarkdown(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], italic: true });
    else {
      const href = safeHref(m[4]);
      out.push(href ? { text: m[3], href } : { text: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function extractFromText(input: string): ExtractResult {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let title: string | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", text: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (code) {
      if (trimmed.startsWith("```")) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    if (trimmed.startsWith("```")) {
      flushAll();
      code = [];
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      const text = heading[2].trim();
      if (title === null && blocks.length === 0 && heading[1].length === 1) title = text;
      else blocks.push({ type: "heading", level: Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4, text });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushAll();
      blocks.push({ type: "divider" });
      continue;
    }
    const image = /^!\[([^\]]*)\]\((\S+?)\)$/.exec(trimmed);
    if (image) {
      flushAll();
      const src = safeHref(image[2]);
      if (src) blocks.push({ type: "figure", src, original_src: src, caption: image[1] || undefined });
      continue;
    }
    const item = /^([-*]|\d+\.)\s+(.*)$/.exec(trimmed);
    if (item) {
      flushPara();
      const ordered = /\d/.test(item[1]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item[2]);
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushAll();
      blocks.push({ type: "quote", text: parseInline(trimmed.replace(/^>\s?/, "")) });
      continue;
    }
    if (trimmed === "") {
      flushAll();
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  if (code) blocks.push({ type: "code", text: (code as string[]).join("\n") });
  flushAll();

  const firstLine = lines.find((l) => l.trim() !== "")?.trim() ?? "제목 없음";
  const firstFigure = blocks.find((b) => b.type === "figure");
  return {
    title: title ?? firstLine.replace(/^#+\s*/, "").slice(0, 80),
    blocks,
    coverImage: firstFigure?.type === "figure" ? firstFigure.src : null,
    // 직접 붙여넣은 글은 추출 실패가 있을 수 없으므로 짧아도 받는다.
    minChars: SHORT_MIN_CHARS,
  };
}
