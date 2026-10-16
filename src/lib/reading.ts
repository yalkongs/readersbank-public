import type { Block } from "@/lib/blocks";

export function headingId(index: number): string {
  return `h-${index}`;
}

export function tocEntries(blocks: Block[]): { id: string; level: 2 | 3 | 4; text: string }[] {
  const out: { id: string; level: 2 | 3 | 4; text: string }[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "heading") out.push({ id: headingId(i), level: b.level, text: b.text });
  });
  return out.length < 3 ? [] : out;
}
