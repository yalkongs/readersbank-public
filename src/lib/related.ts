// 글 끝 "더 읽어볼 글": 웹 검색으로 이 글과 이어 읽을 외부 글을 고른다.
// 모델이 지어낸 주소를 막기 위해 검색 결과에 실제로 나온 주소만 받는다.
import { z } from "zod";
import type { RelatedLink } from "@/db/schema";
import { safeHref } from "@/lib/blocks";

export const MAX_RELATED = 5;

export const RELATED_SYSTEM = `당신은 한국어 웹진의 편집자입니다. 주어진 글을 다 읽은 독자가 이어서 읽을 만한 외부 글 3~5개를 웹 검색으로 찾습니다.
- 같은 주제의 다른 시각, 원문이 언급하거나 기대는 1차 자료(논문·원글·보고서), 이후의 논의를 고르게 고릅니다.
- 원문 자체, 원문을 그대로 옮기거나 짧게 요약한 기사, 광고성 글, 목록형 저품질 글은 뺍니다.
- 언어는 가리지 않습니다.
- 반드시 이번 검색 결과에서 확인한 주소만 씁니다. 주소를 추측하거나 고쳐 쓰지 않습니다.
마지막에 다음 형식의 JSON만 출력합니다(설명 문장 없이):
{"items":[{"url":"검색 결과의 주소","title":"원래 제목","titleKo":"한국어 제목","site":"사이트·매체 이름","why":"왜 이어 읽을 만한지 한국어 한 문장(60자 안팎)"}]}`;

export function buildRelatedUser(a: {
  titleKo: string | null;
  titleOriginal: string | null;
  sourceUrl: string | null;
  leadKo: string | null;
  summaryKo: string[] | null;
}): string {
  return [
    a.titleOriginal && `원제: ${a.titleOriginal}`,
    a.titleKo && `한국어 제목: ${a.titleKo}`,
    a.sourceUrl && `원문 주소: ${a.sourceUrl}`,
    a.leadKo && `한 줄 소개: ${a.leadKo}`,
    a.summaryKo?.length && `요약:\n${a.summaryKo.map((s) => `- ${s}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const ItemSchema = z.object({
  url: z.string(),
  title: z.string().optional().default(""),
  titleKo: z.string().optional().default(""),
  site: z.string().optional().default(""),
  why: z.string().optional().default(""),
});

// 주소 비교용: 프로토콜·www·끝 슬래시·해시를 무시한다.
export function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

function lastJsonObject(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fenced.reverse(), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // 다음 후보
    }
  }
  return null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function parseRelated(text: string, searchedUrls: Set<string>, sourceUrl: string | null, max = MAX_RELATED): RelatedLink[] {
  const json = lastJsonObject(text) as { items?: unknown } | null;
  if (!json || !Array.isArray(json.items)) return [];
  const searched = new Set([...searchedUrls].map(urlKey).filter((k): k is string => k != null));
  const seen = new Set<string>();
  const source = sourceUrl ? urlKey(sourceUrl) : null;
  if (source) seen.add(source);
  const out: RelatedLink[] = [];
  for (const raw of json.items) {
    const p = ItemSchema.safeParse(raw);
    if (!p.success) continue;
    const url = safeHref(p.data.url.trim());
    const key = url ? urlKey(url) : null;
    if (!url || !key || !searched.has(key) || seen.has(key)) continue;
    seen.add(key);
    const title = p.data.title.trim();
    const titleKo = p.data.titleKo.trim() || title;
    if (!titleKo) continue;
    out.push({
      url,
      title: clip(title, 200),
      titleKo: clip(titleKo, 200),
      site: clip(p.data.site.trim() || new URL(url).hostname.replace(/^www\./, ""), 60),
      why: clip(p.data.why.trim(), 160),
    });
    if (out.length >= max) break;
  }
  return out;
}

