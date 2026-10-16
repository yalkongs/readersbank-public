import { expect, test } from "@playwright/test";
import { findKoreanSlug, findTranslatedSlug, sql } from "./helpers";

const cards = (page: import("@playwright/test").Page) => page.locator('main a[href^="/a/"]');

test("홈이 글 목록을 렌더한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ReadersBank" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "검색" })).toHaveCount(0);
  expect(await cards(page).count()).toBeGreaterThan(0);
});

test("헤더 돋보기로 검색 페이지에 가고, 예전 홈 검색 주소는 검색 페이지로 넘어간다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "검색" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("searchbox", { name: "검색" })).toBeFocused();
  expect(await cards(page).count()).toBe(0);
  await page.goto("/?q=AI");
  await expect(page).toHaveURL(/\/search\?q=AI$/);
});

test("검색어 %는 와일드카드가 아니라 글자로 검색된다", async ({ page }) => {
  await page.goto("/");
  const total = await cards(page).count();
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "검색" }).fill("%");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page).toHaveURL(/q=%25/);
  await expect(page.getByRole("heading", { name: "‘%’ 검색 결과" })).toBeVisible();
  expect(await cards(page).count()).toBeLessThan(total);
});

test("태그를 누르면 목록이 걸러지고 다시 누르면 풀린다", async ({ page }) => {
  await page.goto("/");
  const total = await cards(page).count();
  await page.goto("/search");
  const shown = (await page.locator('ul a[href^="/search?tag="]').allTextContents()).map((t) => t.trim());
  // 홈과 같은 기준(공개·게시)으로 태그별 글 수를 세어, 첫 화면 글 수(카드 하나에 링크 하나)보다 적은 태그를 고른다.
  const rows = (await sql().query(
    `SELECT t.name, count(*)::int AS n FROM article_tags at
       JOIN tags t ON t.id = at.tag_id JOIN articles a ON a.id = at.article_id
      WHERE a.status = 'published' AND a.is_public GROUP BY t.name ORDER BY n ASC, t.name`,
  )) as { name: string; n: number }[];
  const pick = rows.find((r) => shown.includes(r.name) && r.n < total);
  test.skip(!pick, "첫 화면 글 수보다 적은 글을 가진 태그가 없어 걸러짐을 엄격히 확인할 수 없음");
  const name = pick!.name;
  await page.locator(`ul a[href="/search?${new URLSearchParams({ tag: name })}"]`).click();
  await expect(page).toHaveURL(/tag=/);
  await expect(page.locator('a[aria-current="true"]')).toHaveText(name);
  await expect.poll(() => cards(page).count()).toBeLessThan(total);
  expect(await cards(page).count()).toBeGreaterThan(0);
  await page.locator('a[aria-current="true"]').click();
  await expect(page).toHaveURL(/\/search$/);
});

test("더 보기로 다음 글을 불러온다", async ({ page }) => {
  await page.goto("/");
  const more = page.getByRole("button", { name: "더 보기" });
  // 게시된 글이 한 페이지(18개)보다 적으면 더 보기가 없다. 공유 DB 데이터에 따라 달라진다.
  test.skip((await more.count()) === 0, "게시된 글이 한 페이지 분량 이하라 더 보기가 없음");
  const before = await cards(page).count();
  await more.click();
  await expect.poll(() => cards(page).count()).toBeGreaterThan(before);
});

test("상세에서 번역·원문 보기를 전환한다", async ({ page }) => {
  const slug = await findTranslatedSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto(`/a/${slug}`);
  const group = page.getByRole("group", { name: "본문 보기" });
  await expect(group.getByRole("button", { name: "번역" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "대조" })).toHaveCount(0);
  await group.getByRole("button", { name: "원문" }).click();
  await expect(group.getByRole("button", { name: "원문" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "번역" })).toHaveAttribute("aria-pressed", "false");
});

test("그림을 눌러 확대하고 Esc로 닫는다", async ({ page }) => {
  const slug = await findTranslatedSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto(`/a/${slug}`);
  await page.locator("button.figure-zoom").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("읽기 설정에서 배경을 바꾸면 data-bg에 반영되고 유지된다", async ({ page }) => {
  const slug = await findKoreanSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto(`/a/${slug}`);
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("dialog", { name: "읽기 설정" }).getByRole("button", { name: "세피아" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-bg", "sepia");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-bg", "sepia");
  await page.getByRole("button", { name: "읽기 설정" }).click();
  await page.getByRole("button", { name: "기본값으로" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-bg", /.+/);
});

test("/read는 사이트 헤더 없이 본문만 보여 준다", async ({ page }) => {
  const slug = await findKoreanSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto(`/a/${slug}/read`);
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("link", { name: "ReadersBank" })).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
});

test("로그인하지 않고 /admin에 가면 로그인으로 보낸다", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin/tokens");
  await expect(page).toHaveURL(/\/admin\/login$/);
  const res = await page.request.post("/api/ingest", { data: { input: "x" } });
  expect(res.status()).toBe(401);
});

test("읽던 위치를 기억해 다시 열면 이어 읽기를 권하고, 홈에 이어서 읽기가 보인다", async ({ page }) => {
  const slug = await findTranslatedSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto(`/a/${slug}`);
  const blocks = page.locator("main [data-block-index]");
  const n = await blocks.count();
  test.skip(n < 12, "본문이 짧아 이어 읽기를 시험할 수 없음");
  await blocks.nth(Math.floor(n / 2)).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rb-progress") ?? "")).toContain(slug!);
  await page.reload();
  await expect(page.getByRole("button", { name: "이어 읽기" })).toBeVisible();
  await page.getByRole("button", { name: "이어 읽기" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "이어서 읽기" })).toBeVisible();
});

test("이어서 읽기는 지워진 글을 보여 주지 않고 기기 기록에서도 지운다", async ({ page }) => {
  const slug = await findTranslatedSlug();
  test.skip(!slug, "조건에 맞는 공개 글이 없음");
  await page.goto("/");
  await page.evaluate((real) => {
    const now = Date.now();
    const entry = (title: string) => ({ title, block: 10, pct: 0.4, blocks: 50, at: now, done: false });
    localStorage.setItem("rb-progress", JSON.stringify({ "20000101-gone00": entry("지워진 글"), [real]: entry("살아 있는 글") }));
  }, slug!);
  await page.reload();
  const section = page.getByRole("region", { name: "이어서 읽기" });
  await expect(section.getByText("살아 있는 글")).toBeVisible();
  await expect(section.getByText("지워진 글")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rb-progress") ?? "")).not.toContain("20000101-gone00");
});
