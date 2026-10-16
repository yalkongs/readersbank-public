import { get } from "@vercel/blob";
import { ExtractError } from "@/lib/extract/types";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function readSourceFile(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await get(url, { access: "public" });
  if (!res || res.statusCode !== 200) throw new ExtractError("업로드한 파일을 찾을 수 없습니다. 다시 업로드해 주세요.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new ExtractError("파일이 너무 큽니다. 25MB 이하로 올려 주세요.");
    }
    chunks.push(value);
  }
  return { bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? res.blob.contentType ?? "" };
}
