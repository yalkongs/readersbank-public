/** ElevenReader 전용 크롬 없는 읽기 페이지 주소. */
export function readerUrl(origin: string, slug: string): string {
  return `${origin}/a/${slug}/read`;
}

/** 일반 글 페이지 주소. */
export function articleUrl(origin: string, slug: string): string {
  return `${origin}/a/${slug}`;
}
