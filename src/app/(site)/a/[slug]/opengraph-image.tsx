import { OG_SIZE, articleOgAlt, renderArticleOg } from "@/lib/og-card";

export const runtime = "nodejs";
// 플랫폼이 이미지를 자체 캐시하므로 1시간 단위로만 다시 만든다.
export const revalidate = 3600;
export const contentType = "image/png";

// og:image는 세로 4:5 한 장만 낸다. 여러 장이면 iMessage가 나란히 붙여 잘라 보여 준다.
// 가로 1.91:1은 twitter-image(twitter:image)로만 낸다.
export async function generateImageMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const alt = await articleOgAlt((await params).slug);
  return [{ id: "portrait", alt, contentType: "image/png", size: OG_SIZE.portrait }];
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return renderArticleOg((await params).slug, "portrait");
}
