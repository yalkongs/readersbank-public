import { headers } from "next/headers";
import Link from "next/link";
import { listApiTokens } from "@/lib/auth/api-token";
import { SITE_URL } from "@/lib/site";
import { ChevronLeftIcon, focusRing } from "../ui";
import { TokenManager } from "./TokenManager";

export const dynamic = "force-dynamic";

async function siteOrigin(): Promise<string> {
  if (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) return SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto")?.split(",")[0].trim() ?? "https"}://${host}`;
  return SITE_URL;
}

export default async function TokensPage() {
  const origin = await siteOrigin();
  const rows = await listApiTokens();
  const tokens = rows.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
  }));
  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-8 md:pt-12">
      <Link
        href="/admin"
        className={`mb-4 inline-flex h-11 items-center gap-1 rounded-lg text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
      >
        <ChevronLeftIcon />
        관리
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">API 토큰</h1>
        <p className="mt-1.5 text-[15px] text-[var(--muted)]">
          iOS 단축어처럼 로그인 없이 글을 보낼 때 쓰는 토큰이에요. 토큰은 글 등록(/api/ingest)에만 쓸 수 있어요.
        </p>
      </header>
      <TokenManager tokens={tokens} origin={origin} />
    </main>
  );
}
