import Link from "next/link";
import { safeHref } from "@/lib/blocks";
import { sourceDomain } from "@/lib/card-meta";
import { isPublicBlobImage } from "@/lib/sw-rules";
import { ReadState } from "@/components/ReadState";
import { CardDate } from "@/components/CardDate";
import type { ArticleCardData } from "@/lib/articles/listing";

export type ArticleCardJSON = Omit<ArticleCardData, "publishedAt" | "id"> & { publishedAt: string | null };

// 날짜 · 출처 도메인 · 이 기기의 읽기 상태. 좁은 칸에서는 도메인이 먼저 줄어든다.
function CardMeta({ a, className }: { a: ArticleCardJSON | ArticleCardData; className: string }) {
  const domain = sourceDomain(a.sourceUrl);
  return (
    <p className={`flex min-w-0 items-baseline whitespace-nowrap text-xs text-[var(--muted)] ${className}`}>
      <CardDate value={a.publishedAt} />
      {domain && <span className="min-w-0 truncate">&nbsp;·&nbsp;{domain}</span>}
      <ReadState slug={a.slug} />
    </p>
  );
}

// 표지 이미지가 없는 글의 인용 표지 색. 흰 글씨가 잘 읽히는 차분한 톤만 쓴다.
const QUOTE_COLORS = ["#3b4a5a", "#45594b", "#6b4f3f", "#574a6b", "#2f5d62", "#75592f", "#6b3f4a"];

export function quoteColor(slug: string): string {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return QUOTE_COLORS[h % QUOTE_COLORS.length];
}

function QuoteCover({ slug, quote, variant }: { slug: string; quote: string; variant: "hero" | "card" }) {
  const hero = variant === "hero";
  return (
    <div
      aria-hidden="true"
      style={{ backgroundColor: quoteColor(slug) }}
      className={`relative flex w-full flex-col justify-center overflow-hidden text-white ${
        hero ? "aspect-[16/9] rounded-xl px-8 pb-6 md:px-14" : "aspect-[16/10] rounded-lg px-6 pb-4"
      }`}
    >
      <span className={`rb-quote-deco font-serif leading-none opacity-40 ${hero ? "text-6xl md:text-7xl" : "text-5xl"}`}>&ldquo;</span>
      <p className={`rb-quote-text break-keep font-semibold [overflow-wrap:anywhere] leading-snug ${hero ? "line-clamp-3 text-xl md:line-clamp-4 md:text-3xl" : "line-clamp-3 text-base md:text-lg"}`}>{quote}</p>
      <span className={`rb-quote-deco absolute right-5 text-xs font-semibold tracking-wide opacity-60 ${hero ? "bottom-5" : "bottom-4"}`}>ReadersBank</span>
    </div>
  );
}

export function ArticleCard({
  a,
  variant,
}: {
  a: ArticleCardJSON | ArticleCardData;
  variant: "hero" | "card";
}) {
  const cover = safeHref(a.coverImage);
  const title = a.titleKo ?? a.titleOriginal ?? "제목 없음";
  const quote = cover ? null : a.quoteKo;
  if (variant === "hero") {
    return (
      <Link href={`/a/${a.slug}`} className="t-card group mb-10 block">
        {(cover || quote) && (
          <div className="t-card-cover mb-4 rounded-xl">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" crossOrigin={isPublicBlobImage(cover) ? "anonymous" : undefined} className="aspect-[16/9] w-full rounded-xl object-cover" />
            )}
            {quote && <QuoteCover slug={a.slug} quote={quote} variant="hero" />}
          </div>
        )}
        <h2 className="rb-title text-2xl font-extrabold leading-snug group-hover:underline md:text-3xl">{title}</h2>
        {a.leadKo && <p className="mt-2 text-[var(--muted)]">{a.leadKo}</p>}
        <CardMeta a={a} className="mt-2" />
      </Link>
    );
  }
  return (
    <Link href={`/a/${a.slug}`} className="t-card group block">
      {(cover || quote) && (
        <div className="t-card-cover mb-3 rounded-lg">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" crossOrigin={isPublicBlobImage(cover) ? "anonymous" : undefined} loading="lazy" className="aspect-[16/10] w-full rounded-lg object-cover" />
          )}
          {quote && <QuoteCover slug={a.slug} quote={quote} variant="card" />}
        </div>
      )}
      <h3 className="rb-title rb-card-title font-bold leading-snug group-hover:underline">{title}</h3>
      {a.leadKo && <p className="rb-card-lead mt-1 line-clamp-2 text-sm text-[var(--muted)]">{a.leadKo}</p>}
      <CardMeta a={a} className="mt-2" />
    </Link>
  );
}
