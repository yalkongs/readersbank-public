import Link from "next/link";
import { ArticleCard } from "@/components/ArticleCard";
import { LoadMore } from "@/components/LoadMore";
import { ViewToggle } from "@/components/ViewToggle";
import { listPublicTags, listPublished } from "@/lib/articles/repo";
import { normalizeQuery } from "@/lib/articles/listing";

export const dynamic = "force-dynamic";

export const metadata = { title: "검색" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const q = normalizeQuery(first(sp.q));
  const tag = first(sp.tag)?.trim() || null;
  const filtered = Boolean(q || tag);
  const [{ items, nextCursor }, tags] = await Promise.all([
    filtered ? listPublished({ q, tag }) : Promise.resolve({ items: [], nextCursor: null }),
    listPublicTags(),
  ]);
  const tagHref = (name: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tag !== name) p.set("tag", name);
    const s = p.toString();
    return s ? `/search?${s}` : "/search";
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="sr-only">검색</h1>
      <form method="get" action="/search" role="search" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          autoFocus={!filtered}
          maxLength={100}
          placeholder="제목·요약·본문 검색"
          aria-label="검색"
          className="w-full rounded-full border border-[var(--line)] bg-transparent px-4 py-2"
        />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button type="submit" className="shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] px-4 py-2 text-sm">
          검색
        </button>
      </form>

      {tags.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.name}>
              <Link
                href={tagHref(t.name)}
                aria-current={tag === t.name ? "true" : undefined}
                className={`relative inline-block max-w-full rounded-full border px-3 py-1 text-sm after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] ${
                  tag === t.name ? "border-transparent bg-[var(--fg,#111)] text-[var(--bg,#fff)]" : "border-[var(--line)] hover:underline"
                }`}
              >
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {q && (
        <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="min-w-0 text-lg font-bold [overflow-wrap:anywhere]">‘{q}’ 검색 결과</h2>
          <Link href={tag ? `/search?tag=${encodeURIComponent(tag)}` : "/search"} className="text-sm text-[var(--muted)] hover:underline">
            검색 지우기
          </Link>
        </div>
      )}

      {!filtered ? null : items.length === 0 ? (
        <p className="py-16 text-[var(--muted)]">조건에 맞는 글이 없습니다.</p>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <ViewToggle />
          </div>
          <ul className="rb-cards grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <li key={a.slug}>
                <ArticleCard a={a} variant="card" />
              </li>
            ))}
          </ul>
          <LoadMore key={`${q ?? ""}|${tag ?? ""}`} initialCursor={nextCursor} q={q ?? undefined} tag={tag ?? undefined} />
        </>
      )}
    </main>
  );
}
