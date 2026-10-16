import { JSDOM } from "jsdom";
import { safeHref, type Block, type Inline } from "@/lib/blocks";
import { parseYouTubeUrl } from "@/lib/youtube";

type Style = Omit<Inline, "text">;

const HEADING_LEVEL: Record<string, 2 | 3 | 4> = { H1: 2, H2: 2, H3: 3, H4: 4, H5: 4, H6: 4 };
const INLINE_TAGS = new Set(["STRONG", "B", "EM", "I", "A", "SPAN", "CODE", "SMALL", "SUP", "SUB", "U", "MARK", "ABBR", "TIME", "BR", "S"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "FORM", "BUTTON", "SVG", "INPUT", "SELECT", "TEMPLATE"]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// jsdom은 SVG 같은 비-HTML 요소의 tagName을 소문자로 돌려주므로 항상 대문자로 비교한다.
function tagOf(el: Element): string {
  return el.tagName.toUpperCase();
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ");
}

// 유튜브 iframe은 영상 블록으로 살린다. 그 밖의 iframe은 버린다.
function videoFrom(el: Element, base?: string): Block | null {
  const src = resolveUrl(el.getAttribute("src") || el.getAttribute("data-src"), base);
  const yt = src ? parseYouTubeUrl(src) : null;
  return yt ? { type: "video", provider: "youtube", ...yt } : null;
}

function resolveUrl(raw: string | null, base?: string): string | undefined {
  if (!raw) return undefined;
  try {
    return safeHref(new URL(raw, base).toString());
  } catch {
    return undefined;
  }
}

function nodeInlines(node: Node, base: string | undefined, style: Style): Inline[] {
  if (node.nodeType === TEXT_NODE) {
    const text = normalize(node.textContent ?? "");
    return text ? [{ text, ...style }] : [];
  }
  if (node.nodeType !== ELEMENT_NODE) return [];
  const el = node as Element;
  switch (tagOf(el)) {
    case "BR":
      return [{ text: "\n", ...style }];
    case "STRONG":
    case "B":
      return childInlines(el, base, { ...style, bold: true });
    case "EM":
    case "I":
      return childInlines(el, base, { ...style, italic: true });
    case "A": {
      const href = resolveUrl(el.getAttribute("href"), base);
      return childInlines(el, base, href ? { ...style, href } : style);
    }
    case "IMG":
      return [];
    default:
      return SKIP_TAGS.has(tagOf(el)) ? [] : childInlines(el, base, style);
  }
}

function childInlines(el: Node, base: string | undefined, style: Style): Inline[] {
  return Array.from(el.childNodes).flatMap((c) => nodeInlines(c, base, style));
}

function isBlockElement(el: Element): boolean {
  return !INLINE_TAGS.has(tagOf(el)) && !SKIP_TAGS.has(tagOf(el)) && tagOf(el) !== "IMG";
}

// Flattens an element's content to inlines, keeping block-level children (nested lists, paragraphs) apart with "\n".
function flatInlines(el: Element, base: string | undefined): Inline[] {
  const out: Inline[] = [];
  const newline = () => {
    if (out.length && !out[out.length - 1].text.endsWith("\n")) out.push({ text: "\n" });
  };
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && isBlockElement(child as Element)) {
      newline();
      out.push(...flatInlines(child as Element, base));
      newline();
    } else {
      out.push(...nodeInlines(child, base, {}));
    }
  }
  return out;
}

function clean(xs: Inline[]): Inline[] {
  const ys = xs.filter((x) => x.text !== "");
  if (ys.length === 0) return ys;
  while (ys.length && ys[0].text.trim() === "") ys.shift();
  if (ys.length === 0) return ys;
  ys[0] = { ...ys[0], text: ys[0].text.replace(/^\s+/, "") };
  while (ys.length && ys[ys.length - 1].text.trim() === "") ys.pop();
  if (ys.length === 0) return ys;
  const last = ys.length - 1;
  ys[last] = { ...ys[last], text: ys[last].text.replace(/\s+$/, "") };
  return ys.filter((x) => x.text !== "");
}

function figureFrom(el: Element, base?: string): Block | null {
  const img = tagOf(el) === "IMG" ? el : el.querySelector("img");
  if (!img) return null;
  const src = resolveUrl(img.getAttribute("src") ?? img.getAttribute("data-src"), base);
  if (!src) return null;
  const caption = normalize(el.querySelector("figcaption")?.textContent ?? "").trim();
  const width = Number(img.getAttribute("width")) || undefined;
  const height = Number(img.getAttribute("height")) || undefined;
  const block: Block = { type: "figure", src, original_src: src };
  if (caption) block.caption = caption;
  // 대체 텍스트는 설명 문구가 아닌 파일 이름·"image" 같은 값이면 버린다.
  const alt = normalize(img.getAttribute("alt") ?? "").trim();
  if (alt && alt !== caption && !/^(image|img|photo|picture|그림|이미지)?[\s_-]*\d*$/i.test(alt) && !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(alt)) {
    block.alt = alt.slice(0, 300);
  }
  if (width) block.width = width;
  if (height) block.height = height;
  return block;
}

function endsWithBreak(xs: Inline[]): boolean {
  for (let i = xs.length - 1; i >= 0; i--) {
    if (xs[i].text.trim() === "" && xs[i].text !== "\n") continue;
    return xs[i].text === "\n";
  }
  return false;
}

const BLOCK_SELECTOR = "p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, table, figure, section, article, hr";

function hasBlockDescendant(el: Element): boolean {
  return el.querySelector(BLOCK_SELECTOR) !== null;
}

function walk(parent: Element, out: Block[], base?: string): void {
  let loose: Inline[] = [];
  const flush = () => {
    const text = clean(loose);
    if (text.length) out.push({ type: "paragraph", text });
    loose = [];
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      loose.push(...nodeInlines(child, base, {}));
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = tagOf(el);
    if (tag === "IFRAME") {
      const video = videoFrom(el, base);
      if (video) {
        flush();
        out.push(video);
      }
      continue;
    }
    if (SKIP_TAGS.has(tag)) continue;
    if (tag === "BR" && endsWithBreak(loose)) {
      // 연속된 <br>은 문단 경계로 본다.
      flush();
      continue;
    }
    if (INLINE_TAGS.has(tag) && !hasBlockDescendant(el)) {
      const imgs = Array.from(el.querySelectorAll("img"));
      if (imgs.length === 0) {
        loose.push(...nodeInlines(el, base, {}));
        continue;
      }
      // <a><img></a>처럼 그림을 감싼 인라인 요소: 글자는 문단에 남기고 그림은 그림 블록으로 꺼낸다.
      loose.push(...nodeInlines(el, base, {}));
      flush();
      for (const img of imgs) {
        const fig = figureFrom(img, base);
        if (fig) out.push(fig);
      }
      continue;
    }
    flush();
    if (INLINE_TAGS.has(tag) || (tag === "P" && hasBlockDescendant(el))) {
      // 블록을 품은 인라인 래퍼/비정상 <p>는 컨테이너로 순회한다.
      walk(el, out, base);
    } else if (tag in HEADING_LEVEL) {
      const text = normalize(el.textContent ?? "").trim();
      if (text) out.push({ type: "heading", level: HEADING_LEVEL[tag], text });
    } else if (tag === "P") {
      const hasText = normalize(el.textContent ?? "").trim() !== "";
      if (hasText) {
        const text = clean(childInlines(el, base, {}));
        if (text.length) out.push({ type: "paragraph", text });
      }
      for (const img of Array.from(el.querySelectorAll("img"))) {
        const fig = figureFrom(img, base);
        if (fig) out.push(fig);
      }
      for (const frame of Array.from(el.querySelectorAll("iframe"))) {
        const video = videoFrom(frame, base);
        if (video) out.push(video);
      }
    } else if (tag === "FIGURE" || tag === "PICTURE" || tag === "IMG") {
      const fig = figureFrom(el, base);
      if (fig) out.push(fig);
      else if (tag === "FIGURE") walk(el, out, base);
    } else if (tag === "BLOCKQUOTE") {
      const inner: Block[] = [];
      walk(el, inner, base);
      for (const b of inner) out.push(b.type === "paragraph" ? { type: "quote", text: b.text } : b);
    } else if (tag === "UL" || tag === "OL") {
      const items = Array.from(el.children)
        .filter((li) => tagOf(li) === "LI")
        .map((li) => clean(flatInlines(li, base)))
        .filter((xs) => xs.length > 0);
      if (items.length) out.push({ type: "list", ordered: tag === "OL", items });
    } else if (tag === "PRE") {
      out.push({ type: "code", text: el.textContent ?? "" });
    } else if (tag === "TABLE") {
      const rows = Array.from(el.querySelectorAll("tr"))
        .map((tr) => Array.from(tr.children).map((cell) => normalize(cell.textContent ?? "").trim()))
        .filter((r) => r.length > 0);
      if (rows.length) out.push({ type: "table", rows });
    } else if (tag === "HR") {
      out.push({ type: "divider" });
    } else {
      walk(el, out, base);
    }
  }
  flush();
}

export function htmlToBlocks(html: string, baseUrl?: string): Block[] {
  const { document } = new JSDOM(`<!doctype html><body>${html}</body>`).window;
  const out: Block[] = [];
  walk(document.body, out, baseUrl);
  return out;
}
