import type { Block } from "@/lib/blocks";

export function needsTranslation(b: Block): boolean {
  if (b.type === "code" || b.type === "divider" || b.type === "video") return false;
  if (b.type === "figure") return Boolean(b.caption);
  return true;
}

// only를 주면 그 인덱스(번역 누락분)만 묶는다.
export function chunkBlocks(blocks: Block[], maxChars = 7_000, only?: ReadonlySet<number>): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let size = 0;
  blocks.forEach((block, index) => {
    if (!needsTranslation(block)) return;
    if (only && !only.has(index)) return;
    const len = JSON.stringify(block).length;
    if (current.length > 0 && size + len > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(index);
    size += len;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}
