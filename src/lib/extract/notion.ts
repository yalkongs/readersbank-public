import { NotionAPI } from "notion-client";
import { safeHref, type Block, type Inline } from "@/lib/blocks";
import { ExtractError, type ExtractResult } from "@/lib/extract/types";

export type NotionBlock = {
  id: string;
  type: string;
  properties?: Record<string, unknown>;
  content?: string[];
  format?: Record<string, unknown>;
};

const NOT_READABLE = "Notion 페이지를 읽지 못했습니다. 공유 설정에서 ‘웹에 게시’가 켜져 있는지 확인해 주세요.";
const MAX_DEPTH = 8;
// 자식(content)을 본문으로 이어 붙이지 않는 블록: 하위 페이지·데이터베이스는 링크일 뿐이고, 표는 행을 직접 읽는다.
const NO_CHILD_WALK = new Set(["page", "collection_view", "collection_view_page", "table", "transclusion_reference"]);

export function parseNotionPageId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const segments = u.pathname.split("/").filter(Boolean);
  const candidates = [u.searchParams.get("p"), segments[segments.length - 1]];
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i);
    if (m) return m.slice(1, 6).join("-").toLowerCase();
  }
  return null;
}

export function unwrapBlock(entry: unknown): NotionBlock | null {
  const outer = (entry as { value?: unknown } | null | undefined)?.value;
  if (!outer || typeof outer !== "object") return null;
  const inner = (outer as { value?: unknown }).value;
  const v = inner && typeof inner === "object" ? inner : outer;
  return typeof (v as NotionBlock).type === "string" ? (v as NotionBlock) : null;
}

function richText(raw: unknown): Inline[] {
  if (!Array.isArray(raw)) return [];
  const out: Inline[] = [];
  for (const seg of raw) {
    if (!Array.isArray(seg) || typeof seg[0] !== "string") continue;
    const inline: Inline = { text: seg[0] };
    if (Array.isArray(seg[1])) {
      for (const deco of seg[1]) {
        if (!Array.isArray(deco)) continue;
        if (deco[0] === "b") inline.bold = true;
        else if (deco[0] === "i") inline.italic = true;
        else if (deco[0] === "a") {
          const href = safeHref(typeof deco[1] === "string" ? deco[1] : undefined);
          if (href) inline.href = href;
        }
      }
    }
    out.push(inline);
  }
  return out;
}

function plain(raw: unknown): string {
  return richText(raw).map((i) => i.text).join("");
}

function hasText(xs: Inline[]): boolean {
  return xs.some((x) => x.text.trim() !== "");
}

export function notionRecordToBlocks(
  recordMap: { block: Record<string, unknown>; signed_urls?: Record<string, string> },
  pageId: string,
): ExtractResult {
  const get = (id: string) => unwrapBlock(recordMap.block?.[id]);
  const page = get(pageId);
  const title = plain(page?.properties?.title).trim();
  const blocks: Block[] = [];

  const imageSrc = (b: NotionBlock): string | null => {
    const source = (b.properties?.source as unknown[][] | undefined)?.[0]?.[0];
    const candidates = [recordMap.signed_urls?.[b.id], b.format?.display_source, source];
    for (const c of candidates) {
      const href = typeof c === "string" ? safeHref(c) : undefined;
      if (href) return href;
    }
    return null;
  };

  const walk = (ids: string[], depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const id of ids) {
      const b = get(id);
      if (!b) continue;
      const title = richText(b.properties?.title);
      switch (b.type) {
        case "text":
          if (hasText(title)) blocks.push({ type: "paragraph", text: title });
          break;
        case "header":
        case "sub_header":
        case "sub_sub_header":
        case "header_4": {
          const text = plain(b.properties?.title);
          if (text.trim()) blocks.push({ type: "heading", level: b.type === "header" ? 2 : b.type === "sub_header" ? 3 : 4, text });
          break;
        }
        case "bulleted_list":
        case "numbered_list":
        case "to_do": {
          const ordered = b.type === "numbered_list";
          let item = title;
          if (b.type === "to_do") {
            const checked = (b.properties?.checked as unknown[][] | undefined)?.[0]?.[0] === "Yes";
            item = [{ text: checked ? "☑ " : "☐ " }, ...title];
          }
          const last = blocks[blocks.length - 1];
          if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
          else blocks.push({ type: "list", ordered, items: [item] });
          break;
        }
        case "quote":
        case "callout":
          if (hasText(title)) blocks.push({ type: "quote", text: title });
          break;
        case "code": {
          const text = plain(b.properties?.title);
          if (text.trim()) blocks.push({ type: "code", text });
          break;
        }
        case "image": {
          const src = imageSrc(b);
          const caption = plain(b.properties?.caption);
          if (!src) {
            if (caption.trim()) blocks.push({ type: "paragraph", text: [{ text: caption }] });
            break;
          }
          blocks.push({ type: "figure", src, original_src: src, ...(caption ? { caption } : {}) });
          break;
        }
        case "divider":
          blocks.push({ type: "divider" });
          break;
        case "toggle":
          if (hasText(title)) blocks.push({ type: "paragraph", text: title });
          break;
        case "transclusion_reference": {
          // 동기화 블록 사본: 원본 컨테이너를 따라가고, 원본이 없으면 자체 content를 읽는다.
          const pointer = (b.format?.transclusion_reference_pointer as { id?: unknown } | undefined)?.id;
          if (typeof pointer === "string" && get(pointer)) walk([pointer], depth + 1);
          else walk(b.content ?? [], depth + 1);
          break;
        }
        case "table": {
          const order = (b.format?.table_block_column_order as string[] | undefined) ?? [];
          const rows = (b.content ?? [])
            .map(get)
            .filter((r): r is NotionBlock => r?.type === "table_row")
            .map((r) => order.map((col) => plain(r.properties?.[col])));
          if (rows.length) blocks.push({ type: "table", rows });
          break;
        }
        case "bookmark": {
          const link = safeHref(plain(b.properties?.link));
          if (link) {
            const label = plain(b.properties?.title).trim() || link;
            blocks.push({ type: "paragraph", text: [{ text: label, href: link }] });
          }
          break;
        }
        default:
          break;
      }
      // column_list·column·transclusion_container 같은 컨테이너와 들여쓴 자식 블록은 부모 뒤에 이어 붙인다.
      if (b.content?.length && !NO_CHILD_WALK.has(b.type)) walk(b.content, depth + 1);
    }
  };

  walk(page?.content ?? [], 0);

  const pageCover = page?.format?.page_cover;
  const cover = typeof pageCover === "string" ? safeHref(pageCover) : undefined;
  const firstFigure = blocks.find((b) => b.type === "figure");
  return {
    title,
    blocks,
    coverImage: cover ?? (firstFigure?.type === "figure" ? firstFigure.src : null),
  };
}

export async function extractFromNotion(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: { getPage(id: string): Promise<any> } = new NotionAPI(),
): Promise<ExtractResult> {
  const pageId = parseNotionPageId(url);
  if (!pageId) throw new ExtractError(NOT_READABLE);
  let recordMap;
  try {
    recordMap = await api.getPage(pageId);
  } catch {
    throw new ExtractError(NOT_READABLE);
  }
  if (!recordMap?.block) throw new ExtractError(NOT_READABLE);
  const result = notionRecordToBlocks(recordMap, pageId);
  if (result.blocks.length === 0) throw new ExtractError(NOT_READABLE);
  return result;
}
