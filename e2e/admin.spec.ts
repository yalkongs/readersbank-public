import { expect, request as pwRequest, test } from "@playwright/test";
import { deleteMarkedArticles, deleteMarkedTokens, loginAsOwner, sql, uniqueMark } from "./helpers";

// 한글 비율이 높은 본문이면 언어 판별에 LLM을 쓰지 않는다. 등록 직후 행을 지우지만 워크플로와 경합하므로
// 요약 단계(LLM)가 한 번 불릴 수는 있다. 행이 없어진 뒤의 단계는 "글이 삭제되었습니다" FatalError로 재시도 없이 멈춘다.
const koreanText = (mark: string) => `${mark} 이 글은 자동 화면 시험이 만든 임시 글이며 곧 삭제됩니다. 한국어 문장으로만 이루어져 있습니다.`;

test.beforeEach(async ({ context, baseURL }) => {
  await loginAsOwner(context, baseURL!);
});

test.afterEach(async () => {
  await deleteMarkedArticles();
  await deleteMarkedTokens();
});

test("등록 화면이 렌더된다", async ({ page }) => {
  await page.goto("/admin/new");
  await expect(page.getByRole("heading", { name: "새 글", level: 1 })).toBeVisible();
  await expect(page.getByLabel("링크 · 글")).toBeVisible();
  await expect(page.getByRole("button", { name: "파일 올리기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "등록", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "최근 등록" })).toBeVisible();
});

test("텍스트를 등록하면 202를 받고 최근 등록에 나타난다", async ({ page }) => {
  const mark = uniqueMark("ui");
  await page.goto("/admin/new");
  await page.getByLabel("링크 · 글").fill(koreanText(mark));
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/ingest") && r.request().method() === "POST"),
    page.getByRole("button", { name: "등록", exact: true }).click(),
  ]);
  expect(res.status()).toBe(202);
  const created = (await res.json()) as { id: string; slug: string; status: string };
  expect(created.status).toBe("queued");
  try {
    await expect(page.getByRole("status")).toContainText("등록했어요");
    // 최근 등록은 처리가 끝나기 전에도 슬러그로 보인다. 처리 완료는 기다리지 않는다.
    await expect(page.getByRole("region", { name: "최근 등록" }).getByText(created.slug)).toBeVisible();
  } finally {
    // 처리 완료를 기다리지 않고 바로 지운다. 워크플로는 다음 단계에서 행이 없음을 보고 재시도 없이 멈춘다.
    await sql().query("DELETE FROM articles WHERE id = $1", [created.id]);
  }
});

test("관리 상세에서 공개 범위를 비공개로 바꿨다가 되돌린다", async ({ page, browser, baseURL }) => {
  const mark = uniqueMark("vis");
  const slug = `e2e-${Math.random().toString(36).slice(2, 10)}`;
  const body = JSON.stringify([{ type: "paragraph", text: [{ text: "자동 시험용 본문입니다." }] }]);
  // 비공개로 만들어 두고 시험 중에만 잠깐 공개한다. 게시일을 2000-01-01로 두어 잠깐 공개된 동안에도 홈 첫 화면에 오르지 않게 한다.
  const [row] = await sql().query(
    `INSERT INTO articles (slug, title_ko, source_type, source_text, lang, lead_ko, summary_ko, body_original, status, is_public, published_at)
     VALUES ($1, $2, 'text', $2, 'ko', '시험용', '["시험용"]'::jsonb, $3::jsonb, 'published', false, '2000-01-01') RETURNING id`,
    [slug, mark, body],
  );
  const id = row.id as string;

  const anon = await browser.newContext({ baseURL });
  try {
    const anonStatus = async () => (await anon.request.get(`/a/${slug}`)).status();
    expect(await anonStatus()).toBe(404);

    // 소유자에게는 비공개 글이 열리고, 서비스 워커가 저장하지 않도록 rb-private 표시가 붙는다.
    const ownerRes = await page.request.get(`/a/${slug}`);
    expect(ownerRes.status()).toBe(200);
    expect(await ownerRes.text()).toContain('<meta name="rb-private"');

    await page.goto(`/admin/a/${id}`);
    const group = page.getByRole("group", { name: "공개 범위" });
    await expect(group.getByRole("button", { name: "비공개" })).toHaveAttribute("aria-pressed", "true");

    await group.getByRole("button", { name: "공개", exact: true }).click();
    await expect(group.getByRole("button", { name: "공개", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(anonStatus).toBe(200);

    await group.getByRole("button", { name: "비공개" }).click();
    await expect(group.getByRole("button", { name: "비공개" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(anonStatus).toBe(404);
  } finally {
    await anon.close();
  }
});

test("API 토큰을 발급해 Bearer로 /api/ingest를 부르고 폐기한다", async ({ page, baseURL }) => {
  const tokenName = uniqueMark("token");
  await page.goto("/admin/tokens");
  await page.getByLabel("토큰 이름").fill(tokenName);
  await page.getByRole("button", { name: "만들기" }).click();
  const plaintext = (await page.getByTestId("new-token").textContent())!.trim();
  expect(plaintext).toMatch(/^rb_[A-Za-z0-9_-]{43}$/);

  // 세션 쿠키 없이 헤더만으로 호출한다.
  const api = await pwRequest.newContext({ baseURL: baseURL! });
  const post = (headers: Record<string, string>) =>
    api.post("/api/ingest", { headers, data: { input: koreanText(uniqueMark("api")) }, maxRedirects: 0 });
  try {
    expect((await post({})).status()).toBe(401);
    expect((await post({ authorization: `Bearer rb_${"A".repeat(43)}` })).status()).toBe(401);

    // 토큰은 관리 화면에는 통하지 않는다.
    const admin = await api.get("/admin/tokens", { headers: { authorization: `Bearer ${plaintext}` }, maxRedirects: 0 });
    expect(admin.status()).toBe(307);
    expect(admin.headers().location).toContain("/admin/login");

    const item = page.getByRole("listitem").filter({ hasText: tokenName });
    await expect(item).toContainText("아직 안 썼어요");

    const ok = await post({ authorization: `Bearer ${plaintext}` });
    expect(ok.status()).toBe(202);
    const created = (await ok.json()) as { id: string };
    await sql().query("DELETE FROM articles WHERE id = $1", [created.id]);

    // 이 토큰 줄의 마지막 사용 표시가 "아직 안 썼어요"에서 시각으로 바뀐다.
    await page.reload();
    await expect(item).toContainText("마지막 사용");
    await expect(item).not.toContainText("아직 안 썼어요");

    // 두 번 눌러 폐기하면 같은 토큰이 다시 401을 받는다.
    await item.getByRole("button", { name: "폐기" }).click();
    await item.getByRole("button", { name: "한 번 더 눌러 폐기" }).click();
    await expect(item.getByText("폐기됨")).toBeVisible();
    expect((await post({ authorization: `Bearer ${plaintext}` })).status()).toBe(401);
  } finally {
    await api.dispose();
  }
});

test("제목·본문을 편집하면 글 페이지에 반영되고, 비운 문단은 거절한다", async ({ page }) => {
  const mark = uniqueMark("edit");
  const slug = `e2e-${Date.now().toString(36)}`;
  const body = JSON.stringify([
    { type: "paragraph", text: [{ text: "첫 문단입니다." }] },
    { type: "paragraph", text: [{ text: "둘째 문단입니다." }] },
  ]);
  const [row] = await sql().query(
    `INSERT INTO articles (slug, title_ko, source_type, source_text, lang, lead_ko, summary_ko, body_original, status, is_public, published_at)
     VALUES ($1, $2, 'text', $2, 'ko', '시험용', '["시험용"]'::jsonb, $3::jsonb, 'published', false, '2000-01-01') RETURNING id`,
    [slug, mark, body],
  );
  const id = row.id as string;
  try {
    await page.goto(`/admin/a/${id}`);
    await page.getByRole("link", { name: "제목·본문 편집" }).click();
    await expect(page.getByRole("heading", { name: "제목·본문 편집" })).toBeVisible();

    await page.getByLabel("제목").fill(`${mark} 고침`);
    const paras = page.getByRole("textbox", { name: "문단" });
    await paras.nth(1).fill("  ");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("비울 수 없어요");

    await paras.nth(1).fill("고친 **둘째** 문단");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/a/${id}$`));

    await page.goto(`/a/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${mark} 고침`);
    await expect(page.locator("main strong", { hasText: "둘째" })).toBeVisible();
    await expect(page.getByText("첫 문단입니다.")).toBeVisible();
  } finally {
    await sql().query("DELETE FROM articles WHERE id = $1", [id]);
  }
});

test("다시 처리하는 동안에도 공개 글은 직전 게시본으로 계속 열린다", async ({ page, browser, baseURL }) => {
  const mark = uniqueMark("snapshot");
  const slug = `e2e-${Date.now().toString(36)}s`;
  const body = JSON.stringify([{ type: "paragraph", text: [{ text: "직전 게시본 본문입니다. 다시 처리하는 동안에도 보여야 합니다." }] }]);
  const [row] = await sql().query(
    `INSERT INTO articles (slug, title_ko, source_type, source_text, lang, lead_ko, summary_ko, body_original, status, is_public, published_at)
     VALUES ($1, $2, 'text', $2, 'ko', '시험용', '["시험용"]'::jsonb, $3::jsonb, 'published', true, '2000-01-01') RETURNING id`,
    [slug, mark, body],
  );
  const id = row.id as string;
  const anon = await browser.newContext({ baseURL });
  try {
    await page.goto(`/admin/a/${id}`);
    const item = page.getByRole("listitem").filter({ hasText: "처음부터 다시" });
    await item.getByRole("button").click();
    await item.getByRole("button", { name: "확인" }).click();
    await expect.poll(async () => (await sql().query("SELECT status, published_snapshot IS NOT NULL AS snap FROM articles WHERE id = $1", [id]))[0]).toMatchObject({ snap: true });
    const res = await anon.request.get(`/a/${slug}`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("직전 게시본 본문입니다");
  } finally {
    await anon.close();
    await sql().query("DELETE FROM articles WHERE id = $1", [id]);
  }
});
