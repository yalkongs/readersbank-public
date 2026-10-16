// Vercel 함수 본문 한도(4.5MB). Content-Length가 이를 넘으면 본문을 읽기 전에 거절한다.
export const MAX_MULTIPART_BODY_BYTES = 4.5 * 1024 * 1024;

export function bodyTooLarge(contentLength: string | null): boolean {
  if (!contentLength) return false;
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_MULTIPART_BODY_BYTES;
}

// Blob 경로에 쓸 파일 이름: 경로·URL 특수문자와 제어문자를 _로 바꾸고 마지막 100자만 쓴다.
export function sanitizeUploadName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\?#%\u0000-\u001f\u007f]/g, "_").trim().slice(-100).trim();
  return cleaned || "upload";
}
