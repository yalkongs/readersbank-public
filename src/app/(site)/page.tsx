import { redirect } from "next/navigation";
import { ArticleCard } from "@/components/ArticleCard";
import { LoadMore } from "@/components/LoadMore";
import { NewArticleFab } from "@/components/NewArticleFab";
import { ContinueReading } from "@/components/ReadState";
import { ViewToggle } from "@/components/ViewToggle";
import { listPublished } from "@/lib/articles/repo";
import { isOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; tag?: string | string[] }>;
}) {
  const sp = await searchParams;
  // 예전 홈 검색 주소(/?q=…, /?tag=…)는 검색 페이지로 보낸다.
  const q = first(sp.q);
  const tag = first(sp.tag);
  if (q || tag) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tag) p.set("tag", tag);
    redirect(`/search?${p}`);
  }
  const [{ items, nextCursor }, owner] = await Promise.all([listPublished({}), isOwner()]);
  const [hero, ...rest] = items;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-10 pt-3">
      {items.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">아직 게시된 글이 없습니다.</p>
      ) : (
        <>
          <ContinueReading />
          <div className="mb-3 flex items-center justify-end">
            <h1 className="sr-only">최근 글</h1>
            <ViewToggle />
          </div>
          {/* 썸네일 보기에서는 첫 글도 다른 글과 같은 칸으로 보여 준다. */}
          <div className="rb-list-only t-stagger-line">
            <ArticleCard a={hero} variant="hero" />
          </div>
          <ul className="rb-cards grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <li className="rb-grid-only">
              <ArticleCard a={hero} variant="card" />
            </li>
            {rest.map((a, i) => (
              <li key={a.slug} className={`t-stagger-line t-stagger-line--${Math.min(i + 2, 8)}`}>
                <ArticleCard a={a} variant="card" />
              </li>
            ))}
          </ul>
          <LoadMore initialCursor={nextCursor} />
        </>
      )}
      {owner && <NewArticleFab />}
    </main>
  );
}
