import { deleteMarkedArticles, deleteMarkedTokens } from "./helpers";

// 테스트가 중간에 죽어 afterEach가 못 돈 경우까지 대비해, 끝에 표식이 붙은 글·토큰을 한 번 더 쓸어 낸다.
export default async function globalTeardown() {
  await deleteMarkedArticles();
  await deleteMarkedTokens();
}
