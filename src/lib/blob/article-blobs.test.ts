import { describe, expect, it, vi } from "vitest";
import { deleteArticleBlobs, type BlobOps } from "@/lib/blob/article-blobs";

const B = "https://abc.public.blob.vercel-storage.com";

function fakeOps(pages: string[][]): BlobOps & { deleted: string[][]; prefixes: string[] } {
  const deleted: string[][] = [];
  const prefixes: string[] = [];
  return {
    deleted,
    prefixes,
    async list({ prefix, cursor }) {
      prefixes.push(prefix);
      const i = cursor ? Number(cursor) : 0;
      const hasMore = i + 1 < pages.length;
      return { blobs: (pages[i] ?? []).map((url) => ({ url })), hasMore, cursor: hasMore ? String(i + 1) : undefined };
    },
    async del(urls) {
      deleted.push(urls);
    },
  };
}

describe("deleteArticleBlobs", () => {
  it("deletes every page under images/{id}/ plus extra URLs, deduped", async () => {
    const ops = fakeOps([[`${B}/images/a1/x.png`], [`${B}/images/a1/y.png`]]);
    const n = await deleteArticleBlobs("a1", [`${B}/uploads/src.pdf`, `${B}/images/a1/x.png`, null], ops);
    expect(ops.prefixes).toEqual(["images/a1/", "images/a1/"]);
    expect(ops.deleted.flat().sort()).toEqual([`${B}/images/a1/x.png`, `${B}/images/a1/y.png`, `${B}/uploads/src.pdf`].sort());
    expect(n).toBe(3);
  });
  it("logs and still deletes extras when listing fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const ops = fakeOps([]);
    ops.list = async () => {
      throw new Error("down");
    };
    await deleteArticleBlobs("a1", [`${B}/uploads/src.pdf`], ops);
    expect(ops.deleted.flat()).toEqual([`${B}/uploads/src.pdf`]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
  it("never throws when del fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const ops = fakeOps([[`${B}/images/a1/x.png`]]);
    ops.del = async () => {
      throw new Error("nope");
    };
    await expect(deleteArticleBlobs("a1", [], ops)).resolves.toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
  it("never deletes another article's blobs or a source file outside /uploads/", async () => {
    const ops = fakeOps([[`${B}/images/a1/x.png`]]);
    await deleteArticleBlobs("a1", [`${B}/images/other/x.png`, `${B}/images/a10/x.png`, `${B}/src.pdf`, `${B}/cover.png`, `${B}/uploads/f.pdf`], ops);
    expect(ops.deleted.flat().sort()).toEqual([`${B}/images/a1/x.png`, `${B}/uploads/f.pdf`].sort());
  });
  it("ignores non-blob URLs and skips del when nothing to delete", async () => {
    const ops = fakeOps([[]]);
    await deleteArticleBlobs("a1", ["https://example.com/a.png"], ops);
    expect(ops.deleted).toEqual([]);
  });
});
