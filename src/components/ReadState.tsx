"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { inProgress, readProgress, removeEntries, writeProgress, type ProgressEntry } from "@/lib/reading-progress";

// 다 읽음으로 표시되기 전에는 반올림해도 100%로 보이지 않게 한다.
const readPct = (pct: number) => Math.min(99, Math.round(pct * 100));

// 카드 날짜 줄 끝에 붙는 이 기기의 읽기 상태: 다 읽은 글만 "· 읽음".
// 읽다 만 글의 진행률은 홈 맨 위 "이어서 읽기"에서 보여 준다.
export function ReadState({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 마운트 후에만 읽을 수 있다
    setDone(readProgress(localStorage)[slug]?.done ?? false);
  }, [slug]);
  if (!done) return null;
  // 날짜 줄이 flex라 앞뒤 공백이 사라지므로 줄바꿈 없는 공백을 쓴다.
  return <span className="shrink-0 text-[var(--accent)]">{"\u00a0·\u00a0읽음"}</span>;
}

// 홈 맨 위 "이어서 읽기": 이 기기에서 읽다 만 글 최대 3편.
export function ContinueReading() {
  const [items, setItems] = useState<{ slug: string; entry: ProgressEntry }[]>([]);
  useEffect(() => {
    // 기기에 남은 기록 중 지워졌거나 비공개로 바뀐 글은 서버에 확인해 빼고, 기록에서도 지운다.
    const candidates = inProgress(readProgress(localStorage), Date.now(), 6);
    if (candidates.length === 0) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams(candidates.map((c) => ["slug", c.slug]));
    fetch(`/api/articles/visible?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { slugs: string[] }) => {
        const ok = new Set(data.slugs);
        const gone = candidates.filter((c) => !ok.has(c.slug)).map((c) => c.slug);
        if (gone.length) writeProgress(localStorage, removeEntries(readProgress(localStorage), gone));
        setItems(candidates.filter((c) => ok.has(c.slug)).slice(0, 3));
      })
      .catch(() => {
        // 오프라인이면 확인 없이 보여 준다(서비스 워커에 저장된 글은 열 수 있다).
        if (!ctrl.signal.aborted) setItems(candidates.slice(0, 3));
      });
    return () => ctrl.abort();
  }, []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="continue-heading" className="t-stagger-line mb-5 rounded-xl bg-[var(--summary-bg)] px-4 py-2.5">
      <h2 id="continue-heading" className="text-[12px] font-bold text-[var(--accent)]">
        이어서 읽기
      </h2>
      <ul className="flex flex-col">
        {items.map(({ slug, entry }) => (
          <li key={slug}>
            <Link href={`/a/${slug}`} className="flex items-center gap-3 py-1 text-[14px]">
              <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
              {/* 막대는 조금 읽은 글에서 점처럼 보여 숫자로 보여 준다. */}
              <span className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]">{readPct(entry.pct)}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
