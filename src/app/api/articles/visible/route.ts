import { viewableSlugs } from "@/lib/articles/repo";
import { isOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

// GET /api/articles/visible?slug=a&slug=b → { slugs: [지금 열 수 있는 것] }. 이어서 읽기 목록에서 지워진 글을 걸러 낸다.
export async function GET(request: Request) {
  const slugs = [...new Set(new URL(request.url).searchParams.getAll("slug"))].filter((s) => SLUG_RE.test(s)).slice(0, 10);
  const visible = await viewableSlugs(slugs, await isOwner());
  return Response.json({ slugs: visible }, { headers: { "Cache-Control": "private, no-store" } });
}
