import { listPublished } from "@/lib/articles/repo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { items, nextCursor } = await listPublished({
    q: sp.get("q"),
    tag: sp.get("tag"),
    cursor: sp.get("cursor"),
  });
  return Response.json(
    {
      // 내부 id는 공개 응답에서 뺀다.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 구조 분해로 제외하는 용도
      items: items.map(({ id: _id, publishedAt, ...rest }) => ({ ...rest, publishedAt: publishedAt?.toISOString() ?? null })),
      nextCursor,
    },
    { headers: { "Cache-Control": "public, s-maxage=30" } },
  );
}
