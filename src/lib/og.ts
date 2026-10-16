// 링크 미리보기(OG) 이미지용 순수 헬퍼. 줄바꿈과 말줄임은 Satori(lineClamp)가 하고,
// 여기서는 렌더 전에 글자 수 상한으로 한 번 더 잘라 비정상적으로 긴 입력을 막는다.

/** 공백 기준으로 maxChars 안에 자르고 말줄임표를 붙인다. 단어 중간은 자르지 않되, 한 단어가 상한을 넘으면 그 단어를 자른다. */
export function clamp(text: string, maxChars: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (maxChars <= 0) return "";
  if ([...s].length <= maxChars) return s;
  const chars = [...s];
  const budget = maxChars - 1; // 말줄임표 자리
  const head = chars.slice(0, budget).join("");
  const nextIsBreak = chars[budget] === " ";
  const lastSpace = head.lastIndexOf(" ");
  const cut = nextIsBreak || lastSpace <= 0 ? head : head.slice(0, lastSpace);
  return cut.trimEnd().replace(/[.,;:!?、。]+$/, "") + "…";
}

export type OgFormat = "portrait" | "landscape";

export const OG_SIZE = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
} as const;
export type OgText = { title: string; lead: string | null; summary: string[] };

const LIMITS = {
  portrait: { title: 150, lead: 130, summaryItem: 110, summaryCount: 3 },
  landscape: { title: 90, lead: 80, summaryItem: 0, summaryCount: 0 },
} as const;

export const SITE_TAGLINE = "읽을 만한 글을 한국어 웹진으로";

export function prepareOgText(
  a: { titleKo: string | null; titleOriginal: string | null; leadKo: string | null; summaryKo: string[] | null },
  format: OgFormat,
): OgText {
  const l = LIMITS[format];
  const title = clamp(a.titleKo ?? a.titleOriginal ?? "ReadersBank", l.title);
  const lead = a.leadKo?.trim() ? clamp(a.leadKo, l.lead) : null;
  const summary = (a.summaryKo ?? [])
    .filter((s) => s.trim())
    .slice(0, l.summaryCount)
    .map((s) => clamp(s, l.summaryItem));
  return { title, lead, summary };
}

/** 표지로 쓸 수 있는 래스터 형식인지 content-type으로 판단한다. Satori는 avif/webp를 못 읽으므로 호출 쪽에서 canvas로 JPEG 변환한다. */
export function supportedCoverType(contentType: string | null): "image/png" | "image/jpeg" | "image/webp" | "image/avif" | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (t === "image/png" || t === "image/webp" || t === "image/avif") return t;
  if (t === "image/jpeg" || t === "image/jpg") return "image/jpeg";
  return null;
}

// 링크 미리보기에서 세로 이미지(og:image)를 그대로 보여 주는 봇. 텔레그램은 twitter:image가 있으면 그쪽을 쓴다.
export function prefersPortraitPreview(userAgent: string | null): boolean {
  return /TelegramBot/i.test(userAgent ?? "");
}

// 가로 미리보기 주소에 붙이는 버전. 제목·소개·표지가 바뀌면 달라져 플랫폼 캐시를 새로 받게 한다.
export function shareImageVersion(a: { titleKo: string | null; leadKo: string | null; coverImage: string | null }): string {
  let h = 5381;
  for (const ch of `${a.titleKo}|${a.leadKo}|${a.coverImage}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
