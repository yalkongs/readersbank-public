// 관리자 제목·본문 편집용 순수 헬퍼.
// 본문 전체를 마크다운 한 덩어리로 고친다. 블록을 더하고 빼고 옮길 수 있다(원문 대조 보기는 없다).
// 저장할 때 글자 그대로 남은 블록은 원래 블록을 그대로 써서, 마크다운으로 옮기지 못하는 서식이 사라지지 않게 한다.
import { blocksToPlainText, safeHref, type Block, type Inline } from "@/lib/blocks";
import { parseInline } from "@/lib/extract/text";
import { isTranslatable } from "@/lib/lang";
import { parseYouTubeUrl, youTubeWatchUrl } from "@/lib/youtube";

export const MAX_TITLE = 200;
export const MAX_BODY = 800_000; // 한글 기준 약 2.4MB. 서버 액션 요청 한도(next.config, 3MB) 안에 들도록
export const MAX_BLOCKS = 5_000;

export function inlineToMarkdown(parts: Inline[]): string {
  return parts
    .map((p) => {
      let t = p.text;
      if (p.href) t = `[${t}](${p.href})`;
      if (p.bold) t = `**${t}**`;
      else if (p.italic) t = `*${t}*`;
      return t;
    })
    .join("");
}

export class EditError extends Error {}

type LineKind = "heading" | "quote" | "ul" | "ol" | "fence" | "divider" | "figure" | "video" | "table" | "text";

const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^>\s?/;
const UL = /^[-*+]\s+/;
const OL = /^\d+[.)]\s+/;
const FENCE = /^(`{3,})/;
const DIVIDER = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FIGURE = /^!\[((?:\\.|[^\]\\])*)\]\((\S+)\)\s*$/;
const TABLE = /^\|.*\|\s*$/;
const TABLE_RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function rawKind(line: string): LineKind {
  if (HEADING.test(line)) return "heading";
  if (QUOTE.test(line)) return "quote";
  if (DIVIDER.test(line)) return "divider";
  if (UL.test(line)) return "ul";
  if (OL.test(line)) return "ol";
  if (FENCE.test(line)) return "fence";
  if (FIGURE.test(line)) return "figure";
  if (TABLE.test(line)) return "table";
  if (!/\s/.test(line.trim()) && parseYouTubeUrl(line)) return "video";
  return "text";
}

// 글 줄이 마크다운 기호로 시작해 다른 블록으로 읽힐 수 있으면 앞에 \를 붙여 글자로 남긴다.
function escapable(line: string): boolean {
  return rawKind(line) !== "text" || (line.startsWith("\\") && escapable(line.slice(1)));
}

function lineKind(line: string): LineKind {
  if (line.startsWith("\\") && escapable(line.slice(1))) return "text";
  return rawKind(line);
}

function unescapeLine(line: string): string {
  return line.startsWith("\\") && escapable(line.slice(1)) ? line.slice(1) : line;
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
const textLines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "")
    .map((l) => (escapable(l) ? `\\${l}` : l));

function blockToMarkdown(b: Block): string {
  switch (b.type) {
    case "heading":
      return `${"#".repeat(b.level)} ${oneLine(b.text)}`;
    case "paragraph":
      return textLines(inlineToMarkdown(b.text)).join("\n");
    case "quote":
      return inlineToMarkdown(b.text)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `> ${l}`)
        .join("\n");
    case "list":
      return b.items
        .map((it) => oneLine(inlineToMarkdown(it)))
        .filter(Boolean)
        .map((t, i) => `${b.ordered ? `${i + 1}.` : "-"} ${t}`)
        .join("\n");
    case "code": {
      const longest = Math.max(2, ...(b.text.match(/^`+/gm) ?? []).map((m) => m.length));
      const fence = "`".repeat(longest + 1);
      return `${fence}\n${b.text}\n${fence}`;
    }
    case "figure":
      return `![${oneLine(b.caption ?? "").replace(/[\\\]]/g, "\\$&")}](${b.src.replace(/\)/g, "%29").replace(/\s/g, "%20")})`;
    case "table":
      return b.rows.map((r) => `| ${r.map((c) => oneLine(c).replace(/\|/g, "\\|") || " ").join(" | ")} |`).join("\n");
    case "divider":
      return "---";
    case "video":
      return youTubeWatchUrl(b.id, b.start);
  }
}

// 블록 하나가 빈 줄로 나뉜 한 덩어리가 된다.
export function bodyToMarkdown(blocks: Block[]): string {
  return blocks
    .map(blockToMarkdown)
    .filter((s) => s.trim() !== "")
    .join("\n\n");
}

type Group = { kind: LineKind; lines: string[]; raw: string };

function groupLines(md: string): Group[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Group[] = [];
  let cur: Group | null = null;
  const flush = () => {
    if (cur) out.push({ ...cur, raw: cur.lines.join("\n") });
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    if (line === "") {
      flush();
      continue;
    }
    const kind = lineKind(line);
    if (kind === "fence") {
      flush();
      const open = line.match(FENCE)![1].length;
      const body: string[] = [line];
      let j = i + 1;
      for (; j < lines.length; j++) {
        body.push(lines[j]);
        const close = lines[j].match(/^(`{3,})\s*$/);
        if (close && close[1].length >= open) break;
      }
      i = j;
      out.push({ kind, lines: body, raw: body.join("\n") });
      continue;
    }
    if (kind === "heading" || kind === "divider" || kind === "figure" || kind === "video") {
      flush();
      out.push({ kind, lines: [line], raw: line });
      continue;
    }
    if (!cur || cur.kind !== kind) {
      flush();
      cur = { kind, lines: [], raw: "" };
    }
    (cur as Group).lines.push(line);
  }
  flush();
  return out;
}

function splitCells(line: string): string[] {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/);
  return cells.map((c) => c.trim().replace(/\\\|/g, "|"));
}

function buildBlock(g: Group, figures: Map<string, Extract<Block, { type: "figure" }>>): Block | null {
  switch (g.kind) {
    case "heading": {
      const m = g.lines[0].match(HEADING)!;
      const text = m[2].trim();
      if (!text) return null;
      return { type: "heading", level: m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4, text };
    }
    case "quote": {
      const text = parseInline(g.lines.map((l) => l.replace(QUOTE, "").trim()).join(" ").trim());
      return text.length ? { type: "quote", text } : null;
    }
    case "ul":
    case "ol": {
      const re = g.kind === "ul" ? UL : OL;
      const items = g.lines.map((l) => parseInline(l.replace(re, "").trim())).filter((xs) => xs.length > 0);
      return items.length ? { type: "list", ordered: g.kind === "ol", items } : null;
    }
    case "fence": {
      const open = g.lines[0].match(FENCE)![1].length;
      const last = g.lines[g.lines.length - 1];
      const closed = g.lines.length > 1 && new RegExp(`^\`{${open},}\\s*$`).test(last);
      const body = g.lines.slice(1, closed ? -1 : undefined).join("\n").replace(/\s+$/, "");
      return { type: "code", text: body };
    }
    case "divider":
      return { type: "divider" };
    case "figure": {
      const m = g.lines[0].match(FIGURE)!;
      const src = safeHref(m[2]);
      if (!src) throw new EditError(`그림 주소는 http(s)로 시작해야 해요: ${m[2].slice(0, 80)}`);
      const caption = oneLine(m[1].replace(/\\(.)/g, "$1"));
      const prev = figures.get(src) ?? figures.get(m[2]);
      const fig: Block = prev ? { ...prev } : { type: "figure", src };
      if (caption) fig.caption = caption;
      else delete fig.caption;
      return fig;
    }
    case "video": {
      const yt = parseYouTubeUrl(g.lines[0])!;
      return { type: "video", provider: "youtube", ...yt };
    }
    case "table": {
      const rows = g.lines.filter((l) => !TABLE_RULE.test(l)).map(splitCells);
      return rows.length ? { type: "table", rows } : null;
    }
    case "text": {
      const text = parseInline(g.lines.map((l) => unescapeLine(l).trim()).join(" ").trim());
      return text.length ? { type: "paragraph", text } : null;
    }
  }
}

// 편집한 마크다운을 블록으로 되돌린다. 원래 블록을 옮긴 글자와 똑같은 덩어리는 원래 블록을 그대로 쓴다.
export function markdownToBody(md: unknown, previous: Block[]): Block[] {
  if (typeof md !== "string") throw new EditError("본문을 읽지 못했어요.");
  if (md.length > MAX_BODY) throw new EditError(`본문은 ${MAX_BODY.toLocaleString()}자까지 쓸 수 있어요.`);
  const unchanged = new Map<string, Block[]>();
  const figures = new Map<string, Extract<Block, { type: "figure" }>>();
  for (const b of previous) {
    const key = blockToMarkdown(b);
    unchanged.set(key, [...(unchanged.get(key) ?? []), b]);
    if (b.type === "figure") figures.set(b.src, b);
  }
  const out: Block[] = [];
  for (const g of groupLines(md)) {
    const same = unchanged.get(g.raw);
    const b = same?.length ? same.shift()! : buildBlock(g, figures);
    if (b) out.push(b);
  }
  if (out.length === 0) throw new EditError("본문을 비울 수 없어요. 내용을 남겨 주세요.");
  if (out.length > MAX_BLOCKS) throw new EditError(`본문 블록은 ${MAX_BLOCKS.toLocaleString()}개까지 쓸 수 있어요.`);
  return out;
}

// 블록 종류의 순서가 그대로인지(번역 누락 위치 같은 인덱스 정보를 계속 쓸 수 있는지).
export function sameStructure(a: Block[], b: Block[]): boolean {
  return a.length === b.length && a.every((x, i) => x.type === b[i].type);
}

// 화면에 보이는 본문이 편집 대상: 번역된 글은 번역문, 그 밖에는 원문.
export function editedBodyField(a: { lang: string | null; bodyKo: Block[] | null }): "bodyKo" | "bodyOriginal" {
  return isTranslatable(a.lang) && a.bodyKo != null ? "bodyKo" : "bodyOriginal";
}

export function validateTitle(title: unknown): string {
  if (typeof title !== "string") throw new EditError("제목을 읽지 못했어요.");
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) throw new EditError("제목을 입력해 주세요.");
  if (t.length > MAX_TITLE) throw new EditError(`제목은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  return t;
}

// 검색용 텍스트. 발행 단계와 편집 저장이 같은 규칙을 쓴다.
export function buildSearchText(
  a: { titleKo: string | null; titleOriginal: string | null; leadKo: string | null; summaryKo: string[] | null; bodyKo: Block[] | null; bodyOriginal: Block[] | null },
  tagNames: string[],
): string {
  return [a.titleKo, a.titleOriginal, a.leadKo, (a.summaryKo ?? []).join("\n"), tagNames.join(" "), blocksToPlainText(a.bodyKo ?? a.bodyOriginal ?? [])]
    .filter(Boolean)
    .join("\n");
}
