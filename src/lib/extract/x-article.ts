// X 아티클(장문 글) → 블록. fxtwitter /2/status/<게시물 ID> 응답의 status.article에
// Draft.js 형식(content.blocks + entityMap)과 그림 목록(media_entities)이 들어 있다.
import { safeHref, type Block, type Inline } from "@/lib/blocks";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | undefined => (typeof v === "number" && v > 0 ? v : undefined);

type Range = { offset: number; length: number };
type Entity = { type: string; data: Obj };

export type XArticle = { title: string; blocks: Block[]; cover: string | null };

// entityMap은 key 순서대로 저장돼 있지 않으므로 key로 찾는다(배열·객체 두 형태 모두 받는다).
function entitiesByKey(map: unknown): Map<number, Entity> {
  const out = new Map<number, Entity>();
  const entries = Array.isArray(map) ? (map as Obj[]).map((e, i) => [e.key ?? i, e.value ?? e] as const) : Object.entries(obj(map));
  for (const [k, v] of entries) {
    const key = Number(k);
    const value = obj(v);
    if (Number.isInteger(key)) out.set(key, { type: str(value.type), data: obj(value.data) });
  }
  return out;
}

function mediaById(list: unknown): Map<string, Obj> {
  const out = new Map<string, Obj>();
  for (const m of arr(list)) if (m.media_id != null) out.set(String(m.media_id), m);
  return out;
}

function imageOf(entry: Obj | undefined): { src: string; width?: number; height?: number; alt?: string } | null {
  const info = obj(entry?.media_info);
  const src = safeHref(str(info.original_img_url) || str(info.media_url_https));
  if (!src) return null;
  const orig = obj(info.original_info);
  return {
    src,
    width: num(info.original_img_width) ?? num(orig.width),
    height: num(info.original_img_height) ?? num(orig.height),
    alt: str(info.ext_alt_text) || undefined,
  };
}

// 한 블록의 글자에 링크(LINK 엔티티)와 굵게·기울임(inlineStyleRanges)을 입힌다.
export function draftInlines(text: string, entityRanges: unknown, styleRanges: unknown, entities: Map<number, Entity>): Inline[] {
  const marks: { start: number; end: number; href?: string; bold?: boolean; italic?: boolean }[] = [];
  for (const r of arr(entityRanges)) {
    const e = entities.get(Number(r.key));
    const href = e?.type === "LINK" ? safeHref(str(e.data.url)) : undefined;
    if (href && typeof r.offset === "number" && typeof r.length === "number") marks.push({ start: r.offset, end: r.offset + r.length, href });
  }
  for (const r of arr(styleRanges) as (Obj & Range)[]) {
    const style = str(r.style).toLowerCase();
    if (typeof r.offset !== "number" || typeof r.length !== "number") continue;
    if (style === "bold") marks.push({ start: r.offset, end: r.offset + r.length, bold: true });
    if (style === "italic") marks.push({ start: r.offset, end: r.offset + r.length, italic: true });
  }
  if (marks.length === 0) return text ? [{ text }] : [];
  const cuts = new Set([0, text.length]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(text.length, m.start)));
    cuts.add(Math.max(0, Math.min(text.length, m.end)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Inline[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    const piece: Inline = { text: text.slice(a, b) };
    for (const m of marks) {
      if (m.start <= a && m.end >= b) {
        if (m.href) piece.href = m.href;
        if (m.bold) piece.bold = true;
        if (m.italic) piece.italic = true;
      }
    }
    out.push(piece);
  }
  return out;
}

const HEADING: Record<string, 2 | 3 | 4> = { "header-one": 2, "header-two": 3, "header-three": 4, "header-four": 4, "header-five": 4, "header-six": 4 };

export function parseXArticle(article: unknown): XArticle | null {
  const a = obj(article);
  const content = obj(a.content);
  const raw = arr(content.blocks);
  if (raw.length === 0) return null;
  const entities = entitiesByKey(content.entityMap);
  const media = mediaById(a.media_entities);
  const blocks: Block[] = [];

  for (const b of raw) {
    const type = str(b.type) || "unstyled";
    const text = str(b.text);
    if (type === "atomic") {
      for (const r of arr(b.entityRanges)) {
        const e = entities.get(Number(r.key));
        if (!e) continue;
        if (e.type === "MEDIA") {
          for (const item of arr(e.data.mediaItems)) {
            const img = imageOf(media.get(String(item.mediaId)));
            if (img) blocks.push({ type: "figure", src: img.src, original_src: img.src, ...(img.alt ? { alt: img.alt } : {}), ...(img.width && img.height ? { width: img.width, height: img.height } : {}) });
          }
        } else if (e.type === "DIVIDER") {
          blocks.push({ type: "divider" });
        } else if (e.type === "TWEET" && str(e.data.tweetId)) {
          const href = `https://x.com/i/status/${str(e.data.tweetId)}`;
          blocks.push({ type: "paragraph", text: [{ text: "인용된 게시물 ↗", href }] });
        } else if (e.type === "MARKDOWN" && str(e.data.markdown)) {
          blocks.push({ type: "code", text: str(e.data.markdown) });
        }
      }
      continue;
    }
    if (!text.trim()) continue;
    if (type in HEADING) {
      blocks.push({ type: "heading", level: HEADING[type], text: text.replace(/\s+/g, " ").trim() });
      continue;
    }
    if (type === "code-block") {
      const last = blocks[blocks.length - 1];
      if (last?.type === "code") last.text += `\n${text}`;
      else blocks.push({ type: "code", text });
      continue;
    }
    const inl = draftInlines(text, b.entityRanges, b.inlineStyleRanges, entities);
    if (type === "unordered-list-item" || type === "ordered-list-item") {
      const ordered = type === "ordered-list-item";
      const last = blocks[blocks.length - 1];
      if (last?.type === "list" && last.ordered === ordered) last.items.push(inl);
      else blocks.push({ type: "list", ordered, items: [inl] });
    } else if (type === "blockquote") {
      blocks.push({ type: "quote", text: inl });
    } else {
      blocks.push({ type: "paragraph", text: inl });
    }
  }

  const coverInfo = obj(obj(a.cover_media).media_info);
  const cover = safeHref(str(coverInfo.original_img_url)) ?? null;
  return { title: str(a.title).trim(), blocks, cover };
}
