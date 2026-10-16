"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleCard, type ArticleCardJSON } from "@/components/ArticleCard";

export function LoadMore({ initialCursor, q, tag }: { initialCursor: string | null; q?: string; tag?: string }) {
  // k: 불러온 묶음 안에서의 순서. 새로 붙는 카드만 차례로 떠오르게 한다.
  const [items, setItems] = useState<(ArticleCardJSON & { k: number })[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!cursor || busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const p = new URLSearchParams({ cursor });
      if (q) p.set("q", q);
      if (tag) p.set("tag", tag);
      const res = await fetch(`/api/articles?${p}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: ArticleCardJSON[]; nextCursor: string | null };
      setItems((prev) => {
        // 커서 사이에 새 글이 발행되면 같은 글이 다시 올 수 있어 slug로 중복을 거른다.
        const seen = new Set(prev.map((a) => a.slug));
        return [...prev, ...data.items.filter((a) => !seen.has(a.slug)).map((a, k) => ({ ...a, k }))];
      });
      setCursor(data.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [cursor, q, tag]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || failed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void load(), { rootMargin: "0px 0px 200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, failed, load]);

  return (
    <>
      {items.length > 0 && (
        <ul className="rb-cards mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <li key={a.slug} className={`t-stagger-line t-stagger-line--${Math.min(a.k + 1, 8)}`}>
              <ArticleCard a={a} variant="card" />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div ref={sentinel} className="mt-8 text-center">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-11 rounded-full border border-[var(--line)] px-5 text-sm hover:underline disabled:opacity-50"
          >
            {failed ? "불러오지 못했습니다. 다시 시도" : loading ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}
    </>
  );
}
