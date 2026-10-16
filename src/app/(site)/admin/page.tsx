import Link from "next/link";
import { parseAdminFilter, type AdminFilterKey } from "@/lib/articles/admin-ops";
import { listForAdmin } from "@/lib/articles/repo";
import { recentTitle } from "@/lib/ingest-ui";
import { AutoRefresh } from "./AutoRefresh";
import { ChevronRightIcon, GlobeIcon, LockIcon, SearchIcon, StatusBadge, focusRing, formatDate } from "./ui";

export const dynamic = "force-dynamic";

const FILTERS: { key: AdminFilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "processing", label: "처리 중" },
  { key: "published", label: "게시됨" },
  { key: "failed", label: "실패" },
  { key: "private", label: "비공개" },
];

type Props = { searchParams: Promise<{ status?: string | string[]; q?: string | string[] }> };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function filterHref(key: AdminFilterKey, q: string): string {
  const sp = new URLSearchParams();
  if (key !== "all") sp.set("status", key);
  if (q) sp.set("q", q);
  const s = sp.toString();
  return s ? `/admin?${s}` : "/admin";
}

export default async function AdminPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filter = parseAdminFilter(first(sp.status));
  const q = (first(sp.q) ?? "").trim().slice(0, 200);
  const rows = await listForAdmin({ statuses: filter.statuses, isPublic: filter.isPublic, q, limit: 100 });
  const active = rows.some((r) => r.status === "queued" || r.status === "processing");
  const filtered = filter.key !== "all" || q !== "";

  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-8 md:pt-12">
      <AutoRefresh active={active} />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-bold tracking-tight">관리</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/notifications"
            className={`flex h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
          >
            알림
          </Link>
          <Link
            href="/admin/tokens"
            className={`flex h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
          >
            API 토큰
          </Link>
          <Link
            href="/admin/new"
            className={`flex h-11 shrink-0 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 ${focusRing}`}
          >
            새 글
          </Link>
        </div>
      </header>

      <form action="/admin" method="get" role="search" className="mb-3">
        {filter.key !== "all" && <input type="hidden" name="status" value={filter.key} />}
        <label htmlFor="admin-q" className="sr-only">
          제목·출처 검색
        </label>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--summary-bg)] pl-3 pr-1 transition-colors focus-within:border-[var(--muted)]">
          <span className="text-[var(--muted)]">
            <SearchIcon />
          </span>
          <input
            id="admin-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="제목·출처 검색"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--fg)] outline-none placeholder:text-[var(--muted)]"
          />
          <button type="submit" className={`h-9 rounded-lg px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}>
            검색
          </button>
        </div>
      </form>

      <nav aria-label="상태 필터" className="-mx-5 mb-5 overflow-x-auto px-5">
        <ul className="flex gap-2">
          {FILTERS.map((f) => {
            const current = filter.key === f.key;
            return (
              <li key={f.key} className="shrink-0">
                <Link
                  href={filterHref(f.key, q)}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${
                    current
                      ? "bg-[var(--fg)] text-[var(--bg)]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--fg)]"
                  } ${focusRing}`}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          {filtered ? (
            <>
              조건에 맞는 글이 없어요.{" "}
              <Link href="/admin" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                필터 지우기
              </Link>
            </>
          ) : (
            "아직 등록한 글이 없어요"
          )}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/a/${r.id}`}
                className={`flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--summary-bg)] ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{recentTitle(r)}</p>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--muted)]">
                    {r.isPublic ? <GlobeIcon size={13} label="공개" /> : <LockIcon size={13} label="비공개" />}
                    <time dateTime={r.createdAt.toISOString()} className="shrink-0 whitespace-nowrap">{formatDate(r.createdAt)}</time>
                    {r.status === "failed" && r.error && <span className="min-w-0 truncate">· {r.error}</span>}
                  </p>
                </div>
                <StatusBadge status={r.status} progress={r.progress} className="max-w-[40%] shrink-0" />
                <span className="shrink-0 text-[var(--muted)]">
                  <ChevronRightIcon />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
