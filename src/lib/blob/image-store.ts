import { put } from "@vercel/blob";
import type { ImageStore } from "@/lib/images/rehost";

export function blobImageStore(articleId: string): ImageStore {
  return {
    async put(bytes, contentType, name) {
      const res = await put(`images/${articleId}/${name}`, Buffer.from(bytes), {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });
      return res.url;
    },
  };
}
