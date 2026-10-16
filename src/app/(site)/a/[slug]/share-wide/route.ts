import { renderArticleOg } from "@/lib/og-card";

// 가로 1.91:1 미리보기(twitter:image). 파일 규칙(twitter-image) 대신 직접 내야
// 글 화면 메타데이터에서 텔레그램처럼 세로 og:image를 써야 할 곳에만 뺄 수 있다.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const img = await renderArticleOg((await params).slug, "landscape");
  return new Response(img.body, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
