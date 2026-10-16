import { imageSize } from "image-size";
import type { Block } from "@/lib/blocks";
import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";

export type ImageStore = { put(bytes: Uint8Array, contentType: string, name: string): Promise<string> };
type Fetcher = (url: string, opts: { maxBytes: number }) => Promise<SafeFetchResult>;

export const MIN_IMAGE_PX = 100;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_ARTICLE = 40;
export const REHOST_DEADLINE_MS = 120_000;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function imageExt(contentType: string): string {
  return EXT[contentType.split(";")[0].trim().toLowerCase()] ?? "img";
}

export function measureImage(bytes: Uint8Array): { width?: number; height?: number } {
  try {
    const { width, height } = imageSize(bytes);
    return { width, height };
  } catch {
    return {};
  }
}

function isBlobHosted(src: string): boolean {
  try {
    return new URL(src).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function rehostImages(
  blocks: Block[],
  deps: {
    store: ImageStore;
    fetcher?: Fetcher;
    measure?: (bytes: Uint8Array) => { width?: number; height?: number };
    deadlineMs?: number;
    now?: () => number;
  },
): Promise<{ blocks: Block[]; cover: string | null }> {
  const fetcher = deps.fetcher ?? safeFetch;
  const measure = deps.measure ?? measureImage;
  const now = deps.now ?? Date.now;
  const deadlineMs = deps.deadlineMs ?? REHOST_DEADLINE_MS;
  const startedAt = now();
  const out: Block[] = [];
  let uploaded = 0;
  let cover: string | null = null;

  for (const block of blocks) {
    if (block.type !== "figure" || isBlobHosted(block.src)) {
      out.push(block);
      continue;
    }
    // 개수 한도나 전체 시간 한도를 넘으면 더 받지 않고 원래 주소를 그대로 둔다.
    if (uploaded >= MAX_IMAGES_PER_ARTICLE || now() - startedAt >= deadlineMs) {
      out.push(block);
      continue;
    }
    const fallback = () => {
      if (block.caption) out.push({ type: "paragraph", text: [{ text: block.caption }] });
    };
    try {
      const res = await fetcher(block.src, { maxBytes: MAX_IMAGE_BYTES });
      if (!res.contentType.toLowerCase().startsWith("image/")) {
        fallback();
        continue;
      }
      const bytes = new Uint8Array(res.body);
      const { width, height } = measure(bytes);
      if ((width !== undefined && width < MIN_IMAGE_PX) || (height !== undefined && height < MIN_IMAGE_PX)) {
        fallback();
        continue;
      }
      uploaded += 1;
      const url = await deps.store.put(bytes, res.contentType.split(";")[0].trim(), `${uploaded}.${imageExt(res.contentType)}`);
      const next: Block = { ...block, src: url, original_src: block.original_src ?? block.src };
      if (width) next.width = width;
      if (height) next.height = height;
      out.push(next);
      cover ??= url;
    } catch {
      fallback();
    }
  }
  return { blocks: out, cover };
}
