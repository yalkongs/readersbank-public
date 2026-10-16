import type { RelatedLink } from "@/db/schema";
import { safeHref } from "@/lib/blocks";

// 글 끝 "더 읽어볼 글": 웹 검색으로 찾은 외부 글. 모두 새 탭으로 연다.
export function RelatedLinks({ links }: { links: RelatedLink[] | null }) {
  const items = (links ?? []).map((l) => ({ ...l, href: safeHref(l.url) })).filter((l) => l.href);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="mt-14 border-t border-[var(--line)] pt-8">
      <h2 id="related-heading" className="mb-5 text-sm font-bold text-[var(--accent)]">
        더 읽어볼 글
      </h2>
      <ul className="flex flex-col gap-6">
        {items.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener nofollow" className="group block">
              <span className="font-bold leading-snug group-hover:underline">{l.titleKo}</span>
              <span aria-hidden="true" className="ml-1 text-[var(--muted)]">↗</span>
              {l.why && <span className="mt-1 block text-[0.95rem] leading-relaxed text-[var(--muted)]">{l.why}</span>}
              <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                {l.site}
                {l.title && l.title !== l.titleKo && ` · ${l.title}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
