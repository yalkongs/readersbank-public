import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { CachePage } from "@/components/CachePage";
import { ListenButton, TitleShareIcons } from "@/components/ListenButton";
import { getBySlugForReadCached, getPublishedBySlugCached } from "@/lib/articles/cached";
import { isOwner } from "@/lib/auth/session";
import { getTagNames } from "@/lib/articles/repo";
import { safeHref } from "@/lib/blocks";
import { OG_SIZE, prefersPortraitPreview, shareImageVersion } from "@/lib/og";
import { RelatedLinks } from "@/components/RelatedLinks";
import { ReadingTracker } from "@/components/ReadingTracker";
import { renderMathMap } from "@/lib/math-render";
import "katex/dist/katex.min.css";
import { isTranslatable } from "@/lib/lang";
import { planAudioChunks, speechHash } from "@/lib/tts/plan";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

// 공개 글은 누구나, 비공개 게시 글은 소유자만 연다. 그 밖에는 null(404).
async function loadViewable(slug: string) {
  const a = await getPublishedBySlugCached(slug);
  if (a) return a;
  if (!(await isOwner())) return null;
  return getBySlugForReadCached(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadViewable(slug);
  if (!a) return {};
  // 비공개 글은 검색·미리보기에 노출하지 않고, 서비스 워커가 저장하지 않도록 표시한다.
  if (!a.isPublic) return { title: a.titleKo ?? a.titleOriginal ?? undefined, robots: { index: false }, other: { "rb-private": "1" } };
  const title = a.titleKo ?? a.titleOriginal ?? undefined;
  const description = a.leadKo ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "article", title, description, siteName: "ReadersBank", locale: "ko_KR", publishedTime: a.publishedAt?.toISOString() },
    // 텔레그램은 twitter:image가 있으면 그것(가로)을 쓰므로, 텔레그램에는 빼서 세로 og:image를 쓰게 한다.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: prefersPortraitPreview((await headers()).get("user-agent"))
        ? undefined
        : [{ url: `/a/${slug}/share-wide?v=${shareImageVersion(a)}`, ...OG_SIZE.landscape, alt: title ?? "ReadersBank", type: "image/png" }],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = await loadViewable(slug);
  if (!a) notFound();
  const isPrivate = !a.isPublic;
  const tagNames = await getTagNames(a.id);
  const original = a.bodyOriginal ?? [];
  const translated = isTranslatable(a.lang) && a.bodyKo != null;
  const sourceHref = safeHref(a.sourceUrl);
  const listenBody = translated ? a.bodyKo! : original;
  // 본문이 바뀐 뒤(다시 처리·편집) 남은 오디오는 내용이 달라 쓰지 않는다.
  const audioUrl = safeHref(a.audioUrl);
  const audio =
    audioUrl && a.audioMeta && a.audioMeta.hash === speechHash(planAudioChunks(listenBody)) ? { url: audioUrl, cues: a.audioMeta.cues } : null;

  return (
    <main className="mx-auto max-w-[680px] px-5 py-8">
      <header className="t-stagger-line mb-8">
        {isPrivate && (
          <p className="mb-3 inline-block rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
            비공개 글
          </p>
        )}
        <div className="article-title text-[1.75rem] font-extrabold leading-tight md:text-4xl">
          <h1 className="inline">{a.titleKo ?? a.titleOriginal}</h1>
          <TitleShareIcons slug={slug} articleId={isPrivate ? a.id : undefined} isPrivate={isPrivate} title={a.titleKo ?? a.titleOriginal ?? ""} blocks={translated ? a.bodyKo! : original} />
        </div>
        {translated && a.titleOriginal && <p className="mt-2 text-sm text-[var(--muted)]">{a.titleOriginal}</p>}
        <p className="mt-3 text-sm text-[var(--muted)]">
          {a.publishedAt && new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(a.publishedAt)}
          {sourceHref && (
            <>
              {" · "}
              <a href={sourceHref} target="_blank" rel="noopener nofollow" className="underline">
                출처
              </a>
            </>
          )}
        </p>
        <ListenButton blocks={listenBody} title={a.titleKo ?? a.titleOriginal ?? undefined} audio={audio} />
        {tagNames.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tagNames.map((t) => (
              <li key={t} className="max-w-full rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs">
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      {(a.leadKo || (a.summaryKo?.length ?? 0) > 0) && (
        <section aria-label="TL;DR" className="t-stagger-line t-stagger-line--2 mb-10 rounded-xl bg-[var(--summary-bg)] p-5">
          <h2 className="mb-2 text-sm font-bold text-[var(--accent)]">TL;DR</h2>
          {a.leadKo && <p className="mb-3 font-semibold leading-relaxed">{a.leadKo}</p>}
          {(a.summaryKo?.length ?? 0) > 0 && (
            <ul className="list-disc space-y-1.5 pl-5 text-[0.95rem] leading-relaxed">
              {(a.summaryKo ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="t-stagger-line t-stagger-line--3">
      <ArticleView
        ko={translated ? a.bodyKo! : original}
        original={translated ? original : null}
        untranslated={a.untranslated}
        originalLang={a.lang ?? undefined}
        math={renderMathMap(translated ? a.bodyKo : null, original)}
      />
      </div>
      <RelatedLinks links={a.relatedLinks} />
      <ReadingTracker slug={slug} title={a.titleKo ?? a.titleOriginal ?? ""} blocks={(translated ? a.bodyKo! : original).length} />
      {!isPrivate && <CachePage />}
    </main>
  );
}
