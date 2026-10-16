import { blockText, type Block } from "@/lib/blocks";
import { needsTranslation } from "./chunk";

export type TranslatedItem = { index: number; block: Block };

export function validateTranslation(original: Block[], indices: number[], items: TranslatedItem[]): Map<number, Block> | null {
  const expected = new Set(indices);
  const result = new Map<number, Block>();
  for (const { index, block } of items) {
    if (!expected.has(index) || result.has(index)) return null;
    const source = original[index];
    if (!source || block.type !== source.type) return null;
    if (block.type === "figure" && source.type === "figure") {
      result.set(index, { ...source, caption: block.caption ?? source.caption });
    } else {
      result.set(index, block);
    }
  }
  return result.size === expected.size ? result : null;
}

export function assembleTranslation(original: Block[], entries: [number, Block][]): { body: Block[]; untranslated: number[] } {
  const translated = new Map(entries);
  const untranslated: number[] = [];
  const body = original.map((block, index) => {
    const t = translated.get(index);
    if (t) return t;
    if (needsTranslation(block)) untranslated.push(index);
    return block;
  });
  return { body, untranslated };
}

// 누락분만 다시 번역한 결과를 기존 번역문에 끼워 넣는다. 이번에도 못 채운 곳은 누락으로 남긴다.
export function fillTranslation(current: Block[], missing: number[], entries: [number, Block][]): { body: Block[]; untranslated: number[] } {
  const filled = new Map(entries);
  const body = current.map((block, index) => filled.get(index) ?? block);
  return { body, untranslated: missing.filter((i) => !filled.has(i)) };
}

function hrefs(b: Block): string {
  const xs = b.type === "paragraph" || b.type === "quote" ? b.text : b.type === "list" ? b.items.flat() : [];
  return xs
    .map((x) => x.href ?? "")
    .filter(Boolean)
    .sort()
    .join("\n");
}

// 교정 결과 중 안전한 것만 고른다. 요청하지 않은 블록, type이 바뀐 블록, 링크가 바뀐 블록,
// 내용이 절반 넘게 줄어든 블록(교정이 문장을 빠뜨린 경우)은 버리고 현재 번역을 둔다.
export function acceptRevisions(current: Block[], indices: number[], items: TranslatedItem[]): [number, Block][] {
  const allowed = new Set(indices);
  const out = new Map<number, Block>();
  for (const { index, block } of items) {
    const cur = current[index];
    if (!allowed.has(index) || out.has(index) || !cur || block.type !== cur.type) continue;
    const next = block.type === "figure" && cur.type === "figure" ? { ...cur, caption: block.caption ?? cur.caption } : block;
    if (hrefs(next) !== hrefs(cur)) continue;
    const before = blockText(cur).length;
    if (blockText(next).length < before * 0.5) continue;
    if (JSON.stringify(next) === JSON.stringify(cur)) continue;
    out.set(index, next);
  }
  return [...out.entries()];
}
