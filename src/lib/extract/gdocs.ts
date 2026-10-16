// Google 문서: "링크가 있는 모든 사용자" 공개 문서를 Word(docx)로 내보내 Word 추출기로 처리한다.
// 웹에 게시한 문서(/document/d/e/…/pub)는 일반 웹 페이지라 여기서 다루지 않는다.
import { parseGoogleDocId } from "@/lib/input";
import { safeFetch, type SafeFetchResult } from "@/lib/net/safe-fetch";
import type { ImageStore } from "@/lib/images/rehost";
import { extractFromDocx } from "./docx";
import { ExtractError, type ExtractResult } from "./types";

export { parseGoogleDocId };

type Fetcher = (url: string, opts: { maxBytes: number }) => Promise<SafeFetchResult>;

const MAX_DOCX_BYTES = 30 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Content-Disposition의 파일 이름(filename* 우선)에서 확장자를 뗀 문서 제목.
export function titleFromDisposition(cd: string | undefined): string {
  if (!cd) return "";
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
  let name = "";
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim());
    } catch {
      name = "";
    }
  }
  if (!name) name = /filename\s*=\s*"([^"]*)"/i.exec(cd)?.[1] ?? "";
  return name.replace(/\.docx$/i, "").trim();
}

const NOT_SHARED =
  "Google 문서를 열 수 없습니다. 공유 설정을 '링크가 있는 모든 사용자(뷰어)'로 바꾼 뒤 다시 등록해 주세요.";

export async function extractFromGoogleDoc(url: string, store: ImageStore, fetcher: Fetcher = safeFetch): Promise<ExtractResult | null> {
  const id = parseGoogleDocId(url);
  if (!id) return null;
  let res: SafeFetchResult;
  try {
    res = await fetcher(`https://docs.google.com/document/d/${id}/export?format=docx`, { maxBytes: MAX_DOCX_BYTES });
  } catch (e) {
    // 비공개 문서는 401/403/404 또는 로그인 페이지로 돌아온다.
    if (e instanceof Error && /HTTP (401|403|404)/.test(e.message)) throw new ExtractError(NOT_SHARED);
    throw e;
  }
  if (!res.contentType.toLowerCase().startsWith(DOCX_TYPE)) throw new ExtractError(NOT_SHARED);
  const result = await extractFromDocx(res.body, store);
  const title = titleFromDisposition(res.contentDisposition);
  return title ? { ...result, title } : result;
}
