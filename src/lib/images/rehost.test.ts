import { describe, expect, it, vi } from "vitest";
import type { Block } from "@/lib/blocks";
import { imageExt, rehostImages, type ImageStore } from "@/lib/images/rehost";

function store(): ImageStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async put(_bytes, contentType, name) {
      calls.push(`${name}|${contentType}`);
      return `https://blob.example/${name}`;
    },
  };
}
const ok = (contentType = "image/png") => async (url: string) => ({ url, status: 200, contentType, body: Buffer.from([1, 2, 3]) });
const big = () => ({ width: 800, height: 600 });

describe("imageExt", () => {
  it("maps common types", () => {
    expect(imageExt("image/jpeg")).toBe("jpg");
    expect(imageExt("image/png; charset=binary")).toBe("png");
    expect(imageExt("image/webp")).toBe("webp");
    expect(imageExt("image/svg+xml")).toBe("svg");
    expect(imageExt("image/x-unknown")).toBe("img");
  });
});

describe("rehostImages", () => {
  it("uploads figures, keeps original_src, numbers files in order, returns first as cover", async () => {
    const s = store();
    const blocks: Block[] = [
      { type: "figure", src: "https://site.com/a.png", original_src: "https://site.com/a.png", caption: "A" },
      { type: "paragraph", text: [{ text: "x" }] },
      { type: "figure", src: "https://site.com/b.jpg" },
    ];
    const r = await rehostImages(blocks, { store: s, fetcher: ok(), measure: big });
    expect(r.blocks).toEqual([
      { type: "figure", src: "https://blob.example/1.png", original_src: "https://site.com/a.png", caption: "A", width: 800, height: 600 },
      { type: "paragraph", text: [{ text: "x" }] },
      { type: "figure", src: "https://blob.example/2.png", original_src: "https://site.com/b.jpg", width: 800, height: 600 },
    ]);
    expect(r.cover).toBe("https://blob.example/1.png");
  });

  it("drops tiny images and replaces failed figures with their caption", async () => {
    const s = store();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ url: "u", status: 200, contentType: "image/gif", body: Buffer.from([1]) })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ url: "u", status: 200, contentType: "text/html", body: Buffer.from("<html>") });
    const measure = vi.fn().mockReturnValue({ width: 1, height: 1 });
    const blocks: Block[] = [
      { type: "figure", src: "https://site.com/pixel.gif" },
      { type: "figure", src: "https://site.com/broken.png", caption: "그림 2" },
      { type: "figure", src: "https://site.com/notimage", caption: "그림 3" },
    ];
    const r = await rehostImages(blocks, { store: s, fetcher, measure });
    expect(r.blocks).toEqual([
      { type: "paragraph", text: [{ text: "그림 2" }] },
      { type: "paragraph", text: [{ text: "그림 3" }] },
    ]);
    expect(s.calls).toEqual([]);
    expect(r.cover).toBeNull();
  });

  it("keeps images whose size is unknown and leaves blob-hosted figures untouched", async () => {
    const s = store();
    const blocks: Block[] = [
      { type: "figure", src: "https://site.com/c.webp" },
      { type: "figure", src: "https://abc.public.blob.vercel-storage.com/images/x.png" },
    ];
    const r = await rehostImages(blocks, { store: s, fetcher: ok("image/webp"), measure: () => ({}) });
    expect(r.blocks[0]).toEqual({ type: "figure", src: "https://blob.example/1.webp", original_src: "https://site.com/c.webp" });
    expect(r.blocks[1]).toEqual(blocks[1]);
  });

  it("stops uploading after the per-article limit and keeps remaining original urls", async () => {
    const s = store();
    const blocks: Block[] = Array.from({ length: 42 }, (_, i) => ({ type: "figure", src: `https://site.com/${i}.png` }) as Block);
    const r = await rehostImages(blocks, { store: s, fetcher: ok(), measure: big });
    expect(s.calls).toHaveLength(40);
    expect(r.blocks[41]).toEqual({ type: "figure", src: "https://site.com/41.png" });
  });

  it("stops fetching after the overall deadline and keeps remaining figures with their original src", async () => {
    const s = store();
    let t = 0;
    const fetcher = vi.fn(async (url: string) => {
      t += 50_000;
      return { url, status: 200, contentType: "image/png", body: Buffer.from([1]) };
    });
    const blocks: Block[] = Array.from({ length: 5 }, (_, i) => ({ type: "figure", src: `https://site.com/${i}.png`, caption: `C${i}` }) as Block);
    const r = await rehostImages(blocks, { store: s, fetcher, measure: big, now: () => t, deadlineMs: 120_000 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(s.calls).toHaveLength(3);
    expect(r.blocks).toHaveLength(5);
    expect(r.blocks.slice(3)).toEqual(blocks.slice(3));
  });

  it("uses a 120 second default deadline", async () => {
    const s = store();
    let t = 1_000;
    const fetcher = vi.fn(async (url: string) => {
      t += 119_000;
      return { url, status: 200, contentType: "image/png", body: Buffer.from([1]) };
    });
    const blocks: Block[] = [0, 1, 2].map((i) => ({ type: "figure", src: `https://site.com/${i}.png` }) as Block);
    const r = await rehostImages(blocks, { store: s, fetcher, measure: big, now: () => t });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(r.blocks[2]).toEqual(blocks[2]);
  });
});

