// 본문에서 한글이 차지하는 비중. 라틴 문자는 단어 단위(한 단어 ≈ 한글 2자), 가나·한자는 글자 단위로 센다.
// 그 밖의 문자(키릴·그리스·아랍 등)도 분모에 넣어, 한글 몇 글자가 섞인 외국어 글을 한국어로 오판하지 않게 한다.
export function hangulRatio(text: string): number {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z]+/g) ?? []).length;
  const kanaHan = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu) ?? []).length;
  const other = (text.match(/[^\p{Script=Hangul}\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\P{L}]/gu) ?? []).length;
  const units = hangul + latinWords * 2 + kanaHan + other / 2;
  return units === 0 ? 0 : hangul / units;
}

// 본문 번역 대상: 한국어가 아닌 모든 언어(ISO 639-1 두 글자 코드).
export function isTranslatable(lang: string | null | undefined): boolean {
  return typeof lang === "string" && /^[a-z]{2}$/.test(lang) && lang !== "ko";
}

export function quickLang(text: string): "ko" | "unknown" {
  return hangulRatio(text) >= 0.3 ? "ko" : "unknown";
}
