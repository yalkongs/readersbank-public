"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { INGEST_SUBMITTED_EVENT, statusLabel, type RecentStatus, type StatusTone } from "@/lib/ingest-ui";

export type RecentRow = { id: string; slug: string; title: string; status: RecentStatus; progress: string | null; isPublic: boolean };

const TONE: Record<StatusTone, string> = {
  muted: "border border-[var(--line)] text-[var(--muted)]",
  accent: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]",
  success: "bg-[color-mix(in_srgb,#16a34a_14%,transparent)] text-[color-mix(in_srgb,#16a34a_80%,var(--fg))]",
  danger: "bg-[color-mix(in_srgb,#dc2626_12%,transparent)] text-[color-mix(in_srgb,#dc2626_80%,var(--fg))]",
};

const POLL_MS = 5000;

export function RecentSubmissions({ rows }: { rows: RecentRow[] }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const active = rows.some((r) => r.status === "queued" || r.status === "processing");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [active, router]);

  useEffect(() => {
    const onSubmitted = () => router.refresh();
    window.addEventListener(INGEST_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(INGEST_SUBMITTED_EVENT, onSubmitted);
  }, [router]);

  return (
    <section aria-labelledby="recent-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-heading" className="text-[13px] font-semibold text-[var(--muted)]">
          최근 등록
        </h2>
        <div className="flex items-center gap-1">
          <Link href="/admin" className="flex h-11 items-center rounded-md px-2 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--fg)]">
            전체 보기
          </Link>
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            aria-label="새로고침"
            title="새로고침"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={refreshing ? "animate-spin" : undefined}
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">아직 등록한 글이 없어요</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
          {rows.map((r) => {
            const s = statusLabel(r);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {r.status === "published" ? (
                    <Link href={`/a/${r.slug}`} className="truncate text-[15px] font-medium underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <span className="truncate text-[15px] font-medium">{r.title}</span>
                  )}
                  {!r.isPublic && (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      role="img"
                      aria-label="비공개"
                      className="shrink-0 text-[var(--muted)]"
                    >
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  )}
                </div>
                <span className={`max-w-[45%] shrink-0 truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[s.tone]}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
