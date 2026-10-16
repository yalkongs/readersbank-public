/** /read 열람 게이트: 공개 글은 토큰과 무관하게 열고, 비공개 글은 유효한 토큰이 있을 때만 연다. */
export function canRead(article: { isPublic: boolean }, tokenValid: boolean): boolean {
  return article.isPublic || tokenValid;
}
