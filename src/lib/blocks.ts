import { z } from "zod";

export const InlineSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: z.string().optional(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string() }),
  z.object({ type: z.literal("paragraph"), text: z.array(InlineSchema) }),
  z.object({ type: z.literal("quote"), text: z.array(InlineSchema) }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(InlineSchema)) }),
  z.object({ type: z.literal("code"), text: z.string() }),
  z.object({
    type: z.literal("figure"),
    src: z.string(),
    original_src: z.string().optional(),
    caption: z.string().optional(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal("divider") }),
  // 유튜브 영상. id는 11자 영상 ID, start는 시작 초.
  z.object({ type: z.literal("video"), provider: z.literal("youtube"), id: z.string(), start: z.number().optional() }),
]);

export type Inline = z.infer<typeof InlineSchema>;
export type Block = z.infer<typeof BlockSchema>;

export function safeHref(href: string | undefined | null): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function inlineText(xs: Inline[]): string {
  return xs.map((x) => x.text).join("");
}

export function blockText(b: Block): string {
  switch (b.type) {
    case "heading":
    case "code":
      return b.text;
    case "paragraph":
    case "quote":
      return inlineText(b.text);
    case "list":
      return b.items.map(inlineText).join("\n");
    case "figure":
      return b.caption ?? "";
    case "table":
      return b.rows.map((r) => r.join(" | ")).join("\n");
    case "divider":
    case "video":
      return "";
  }
}

export function blocksToPlainText(blocks: Block[]): string {
  return blocks.map(blockText).filter((t) => t.trim() !== "").join("\n\n");
}
