import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { blockText, inlineText, type Block } from "@/lib/blocks";
import { getBySlugForReadCached } from "@/lib/articles/cached";
import { canRead } from "@/lib/articles/read-gate";
import { verifyReadToken } from "@/lib/auth/read-token";
import { isTranslatable } from "@/lib/lang";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string | string[] }> };

// 공개 글은 토큰을 무시한다. 비공개 글은 그 글의 유효한 ?t= 토큰이 있을 때만 연다.
async function loadReadable(slug: string, t: string | string[] | undefined) {
  const a = await getBySlugForReadCached(slug);
  if (!a) return null;
  const tokenValid = a.isPublic ? false : await verifyReadToken(typeof t === "string" ? t : undefined, a.id);
  return canRead(a, tokenValid) ? a : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadReadable(slug, (await searchParams).t);
  if (!a) return {};
  return {
    title: a.titleKo ?? a.titleOriginal ?? undefined,
    robots: { index: false },
    // 비공개 글은 서비스 워커가 저장하지 않도록 표시한다.
    ...(a.isPublic ? {} : { other: { "rb-private": "1" } }),
  };
}

function ReadBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return <h2>{block.text}</h2>;
    case "paragraph":
      return <p>{inlineText(block.text)}</p>;
    case "quote":
      return <blockquote>{inlineText(block.text)}</blockquote>;
    case "list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{inlineText(item)}</li>
          ))}
        </ul>
      );
    case "figure":
      return block.caption ? <p>{block.caption}</p> : null;
    case "code":
    case "divider":
    case "video":
      return null;
    case "table":
      return <p>{blockText(block)}</p>;
  }
}

export default async function ReadPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const a = await loadReadable(slug, (await searchParams).t);
  if (!a) notFound();
  const blocks = (isTranslatable(a.lang) ? a.bodyKo : null) ?? a.bodyOriginal ?? [];
  return (
    <article lang="ko" style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px", lineHeight: 1.75 }}>
      <h1>{a.titleKo ?? a.titleOriginal}</h1>
      {a.leadKo && <p>{a.leadKo}</p>}
      {(a.summaryKo ?? []).length > 0 && (
        <section>
          <h2>TL;DR</h2>
          <ul>
            {(a.summaryKo ?? []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {blocks.map((b, i) => (
        <ReadBlock key={i} block={b} />
      ))}
    </article>
  );
}
