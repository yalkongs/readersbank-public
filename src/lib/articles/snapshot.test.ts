import { describe, expect, it } from "vitest";
import type { Article } from "@/db/schema";
import { snapshotForReprocess, takeSnapshot, withSnapshot } from "@/lib/articles/snapshot";

const base = {
  id: "a",
  slug: "s",
  status: "published",
  titleKo: "제목",
  titleOriginal: "Title",
  leadKo: "리드",
  summaryKo: ["요약"],
  bodyOriginal: [{ type: "paragraph", text: [{ text: "orig" }] }],
  bodyKo: [{ type: "paragraph", text: [{ text: "번역" }] }],
  untranslated: [],
  coverImage: null,
  lang: "en",
  relatedLinks: null,
  publishedSnapshot: null,
} as unknown as Article;

describe("snapshot", () => {
  it("takes a snapshot when reprocessing a published article, keeps the old one when retrying a failed reprocess", () => {
    expect(snapshotForReprocess(base)?.titleKo).toBe("제목");
    const failed = { ...base, status: "failed", titleKo: null, publishedSnapshot: takeSnapshot(base) } as Article;
    expect(snapshotForReprocess(failed)?.titleKo).toBe("제목");
    expect(snapshotForReprocess({ ...base, status: "failed" } as Article)).toBeNull();
  });
  it("serves the snapshot as a published article while processing", () => {
    const processing = { ...base, status: "processing", titleKo: null, bodyKo: null, publishedSnapshot: takeSnapshot(base) } as Article;
    const shown = withSnapshot(processing);
    expect(shown.status).toBe("published");
    expect(shown.titleKo).toBe("제목");
    expect(shown.bodyKo).toEqual(base.bodyKo);
    expect(withSnapshot(base)).toBe(base);
  });
});
