// 메뉴의 "주제로 글 찾기": 주제어로 웹을 검색해 웹진에 옮길 만한 외부 글을 고른다.
// 결과 형식·주소 검증은 "더 읽어볼 글"과 같다(검색 결과에 실제로 나온 주소만 받는다).
import type { RelatedLink } from "@/db/schema";
import { parseRelated } from "@/lib/related";

export const MAX_DISCOVER = 8;
export const MAX_TOPIC_CHARS = 100;

export const DISCOVER_SYSTEM = `당신은 한국어 웹진의 편집자입니다. 주어진 주제어로 웹 검색을 해서, 한국어로 옮겨 실을 만한 외부 글 5~8개를 고릅니다.
- 깊이 있는 에세이·칼럼·장문 기사·연구자의 블로그 글·보고서처럼 끝까지 읽을 가치가 있는 글을 고릅니다. 다양한 관점과 출처를 섞습니다.
- 로그인이나 구독 없이 본문 전체를 읽을 수 있는 글만 고릅니다(유료 구독 기사, 회원 전용 글은 뺍니다).
- 목록형·광고성 글, 짧은 단신, 검색 결과·태그·카테고리 페이지, 동영상만 있는 페이지, PDF 파일은 뺍니다.
- 언어는 가리지 않습니다. 최근 글과 오래 읽힐 만한 글을 고르게 섞습니다.
- 반드시 이번 검색 결과에서 확인한 주소만 씁니다. 주소를 추측하거나 고쳐 쓰지 않습니다.
마지막에 다음 형식의 JSON만 출력합니다(설명 문장 없이):
{"items":[{"url":"검색 결과의 주소","title":"원래 제목","titleKo":"한국어 제목","site":"사이트·매체 이름","why":"어떤 글이고 왜 읽을 만한지 한국어 한 문장(60자 안팎)"}]}`;

export function normalizeTopic(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  return t && t.length <= MAX_TOPIC_CHARS ? t : null;
}

export function buildDiscoverUser(topic: string): string {
  return `주제어: ${topic}`;
}

export function parseDiscover(text: string, searchedUrls: Set<string>): RelatedLink[] {
  return parseRelated(text, searchedUrls, null, MAX_DISCOVER);
}
