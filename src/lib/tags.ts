// 태그 정규화(클라이언트에서도 쓸 수 있도록 의존성 없음).
const CJK_OR_KANA = /[一-鿿㐀-䶿豈-﫿぀-ヿ]/;

// 태그에 한자(漢字)나 일본어 가나가 들어 있으면 쓰지 않는다.
export function hasCjkOrKana(tag: string): boolean {
  return CJK_OR_KANA.test(tag);
}

// 앞뒤 공백 제거, 빈 값·한자·가나 제외, 대소문자 무시 중복 제거, 최대 max개.
export function normalizeTags(raw: string[], max: number): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw.map((x) => x.trim()).filter(Boolean)) {
    if (hasCjkOrKana(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  return tags.slice(0, max);
}

// 태그 입력란: 쉼표로 나뉜 입력을 기존 목록에 합친다. 한자·가나는 서버가 이름을 짚어 거부하므로 여기서 거르지 않는다.
export function mergeTagInput(current: string[], raw: string, max: number): { tags: string[]; hint: string | null } {
  const tags = [...current];
  let hint: string | null = null;
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      hint = "이미 있는 태그예요";
      continue;
    }
    if (tags.length >= max) {
      hint = `태그는 ${max}개까지 붙일 수 있어요`;
      break;
    }
    tags.push(t);
  }
  return { tags, hint };
}
