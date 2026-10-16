"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { discoverAction, type DiscoverItem } from "@/lib/actions/discover";
import { INGEST_SUBMITTED_EVENT } from "@/lib/ingest-ui";
import { MAX_TOPIC_CHARS } from "@/lib/discover";

type Ingest = { state: "busy" } | { state: "done" } | { state: "error"; error: string; slug?: string };

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

export function DiscoverClient({ initialTopic }: { initialTopic: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initialTopic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [ingest, setIngest] = useState<Record<string, Ingest>>({});
  const started = useRef(false);

  async function search(t: string) {
    setBusy(true);
    setError(null);
    setItems(null);
    setIngest({});
    try {
      const r = await discoverAction(t);
      if (r.ok) setItems(r.items);
      else setError(r.error);
    } catch {
      setError("네트워크 오류로 찾지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  // 메뉴에서 주제어를 들고 들어오면 바로 찾는다(주소의 q가 바뀌면 key로 새로 그려진다).
  useEffect(() => {
    if (started.current || !initialTopic) return;
    started.current = true;
    void search(initialTopic);
  }, [initialTopic]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = topic.trim();
    if (!t || busy) return;
    if (t === initialTopic) void search(t);
    else router.replace(`/admin/discover?q=${encodeURIComponent(t)}`);
  }

  async function register(url: string) {
    setIngest((s) => ({ ...s, [url]: { state: "busy" } }));
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: url, isPublic: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIngest((s) => ({ ...s, [url]: { state: "done" } }));
        window.dispatchEvent(new Event(INGEST_SUBMITTED_EVENT));
      } else setIngest((s) => ({ ...s, [url]: { state: "error", error: data.error ?? "등록하지 못했어요", slug: data.slug } }));
    } catch {
      setIngest((s) => ({ ...s, [url]: { state: "error", error: "네트워크 오류로 등록하지 못했어요" } }));
    }
  }

  return (
    <div>
      <form onSubmit={submit} role="search" className="flex gap-2">
        <input
          type="search"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={MAX_TOPIC_CHARS}
          placeholder="예: 문어의 지능, 도시 열섬, AI 정렬"
          aria-label="주제어"
          enterKeyHint="search"
          className={`h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] ${focusRing}`}
        />
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className={`h-11 shrink-0 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 ${focusRing}`}
        >
          찾기
        </button>
      </form>

      <div className="mt-8" aria-live="polite">
        {busy && (
          <p className="flex items-center gap-2 text-[15px] text-[var(--muted)]" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" aria-hidden="true" />
            웹에서 찾는 중이에요. 30초에서 1분쯤 걸려요.
          </p>
        )}
        {error && <p className="text-[15px] text-[#dc2626]">{error}</p>}
        {items && items.length === 0 && <p className="text-[15px] text-[var(--muted)]">알맞은 글을 찾지 못했어요. 주제어를 바꿔 보세요.</p>}
        {items && items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((it) => (
              <li key={it.url} className="rounded-2xl border border-[var(--line)] p-4">
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="rb-title block text-[16px] font-semibold leading-snug hover:underline">
                  {it.titleKo}
                </a>
                {it.title && it.title !== it.titleKo && <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{it.title}</p>}
                {it.why && <p className="mt-2 text-[14px] leading-relaxed">{it.why}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] text-[var(--muted)]">{it.site}</span>
                  <RegisterButton item={it} status={ingest[it.url]} onRegister={() => register(it.url)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RegisterButton({ item, status, onRegister }: { item: DiscoverItem; status?: Ingest; onRegister: () => void }) {
  const small = "shrink-0 text-[13px]";
  if (item.existing?.status === "published") {
    return (
      <Link href={`/a/${item.existing.slug}`} className={`${small} font-medium text-[var(--accent)] hover:underline`}>
        이미 등록됨 · 읽기
      </Link>
    );
  }
  if (item.existing) return <span className={`${small} text-[var(--muted)]`}>처리 중인 글</span>;
  if (status?.state === "done") {
    return (
      <Link href="/admin" className={`${small} font-medium text-[#16a34a] hover:underline`}>
        등록했어요 · 처리 상황 보기
      </Link>
    );
  }
  if (status?.state === "error") {
    return status.slug ? (
      <Link href={`/a/${status.slug}`} className={`${small} text-[var(--accent)] hover:underline`}>
        {status.error} · 읽기
      </Link>
    ) : (
      <button type="button" onClick={onRegister} className={`${small} text-[#dc2626] hover:underline`}>
        {status.error} · 다시 시도
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onRegister}
      disabled={status?.state === "busy"}
      className={`h-9 shrink-0 rounded-full border border-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] disabled:opacity-50 ${focusRing}`}
    >
      {status?.state === "busy" ? "등록 중…" : "등록"}
    </button>
  );
}
