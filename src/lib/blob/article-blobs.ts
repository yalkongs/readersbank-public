// 글 삭제 시 관련 Blob(images/{articleId}/ 아래 전부 + 추가 URL)을 지운다. 실패는 로그만 남기고 던지지 않는다.
// 추가 URL은 이 글의 이미지 폴더나 업로드 원본(uploads/)일 때만 지운다 — 다른 글의 Blob은 절대 건드리지 않는다.
import { del, list } from "@vercel/blob";
import { isArticleOwnedBlob, isUploadedSourceBlob } from "@/lib/articles/admin-ops";

export type BlobOps = {
  list(opts: { prefix: string; cursor?: string }): Promise<{ blobs: { url: string }[]; hasMore: boolean; cursor?: string }>;
  del(urls: string[]): Promise<void>;
};

const defaultOps: BlobOps = {
  list: (opts) => list(opts),
  del: (urls) => del(urls),
};

const DEL_BATCH = 100;

export async function deleteArticleBlobs(articleId: string, extraUrls: (string | null | undefined)[], ops: BlobOps = defaultOps): Promise<number> {
  const urls = new Set<string>();
  for (const u of extraUrls) if (u && (isArticleOwnedBlob(u, articleId) || isUploadedSourceBlob(u))) urls.add(u);
  const prefix = `images/${articleId}/`;
  try {
    let cursor: string | undefined;
    do {
      const page = await ops.list({ prefix, cursor });
      for (const b of page.blobs) urls.add(b.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    console.error(`[delete] Blob 목록 조회 실패 (${prefix})`, err);
  }
  const all = [...urls];
  let deleted = 0;
  for (let i = 0; i < all.length; i += DEL_BATCH) {
    const batch = all.slice(i, i + DEL_BATCH);
    try {
      await ops.del(batch);
      deleted += batch.length;
    } catch (err) {
      console.error(`[delete] Blob 삭제 실패 (${batch.length}개)`, err);
    }
  }
  return deleted;
}
