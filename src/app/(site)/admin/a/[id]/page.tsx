import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { reprocessOptions } from "@/lib/articles/admin-ops";
import { findIdBySlug, getArticle, getArticleUsage, getTagNames } from "@/lib/articles/repo";
import { safeHref } from "@/lib/blocks";
import { recentTitle } from "@/lib/ingest-ui";
import { MODEL_PRICES, estimateCostUsd, modelForStep, type UsageRow } from "@/lib/usage";
import { AutoRefresh } from "../../AutoRefresh";
import { AlertIcon, ChevronLeftIcon, ExternalIcon, StatusBadge, focusRing, formatDateTime } from "../../ui";
import { AudioGenerator, CoverGenerator, DeleteSection, ListenLinkCopy, RelatedRefresh, ReprocessSection, TagEditor, VisibilityToggle } from "./ArticleControls";
import { isTranslatable } from "@/lib/lang";
import { audioChars, listenBlocks, planAudioChunks, speechHash } from "@/lib/tts/plan";

export const dynamic = "force-dynamic";
// "추천 다시 찾기"(웹 검색)와 "이미지 생성"(설계+그리기)을 기다리므로 넉넉히 둔다.
export const maxDuration = 180;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STEP_LABEL: Record<string, string> = {
  detect_lang: "언어 확인",
  extract_pdf: "PDF 추출",
  translate: "번역",
  brief: "번역 준비",
  review: "번역 다듬기",
  summarize: "요약·태그",
  related: "추천 글 검색",
};

const LANG_LABEL: Record<string, string> = { en: "영어", ko: "한국어", ja: "일본어", zh: "중국어", fr: "프랑스어", de: "독일어", es: "스페인어" };
const SOURCE_LABEL: Record<string, string> = { url: "웹 페이지", notion: "Notion", text: "텍스트", docx: "Word 파일", pdf: "PDF 파일" };

const num = new Intl.NumberFormat("ko-KR");
function usd(n: number): string {
  return `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
}

const S = MODEL_PRICES.sonnet;
const H = MODEL_PRICES.haiku;
const PRICE_NOTE = `비용은 추정치예요. 100만 토큰당 Sonnet 입력 $${S.input}·출력 $${S.output}·캐시 읽기 $${S.cacheRead.toFixed(2)}, Haiku 입력 $${H.input.toFixed(2)}·출력 $${H.output.toFixed(2)} 기준.`;

const card = "rounded-2xl border border-[var(--line)] bg-[var(--summary-bg)] p-4 md:p-5";
const sectionTitle = "mb-3 text-[13px] font-semibold text-[var(--muted)]";
const linkButton = `flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm font-medium transition-colors hover:border-[var(--muted)] ${focusRing}`;

export default async function AdminArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 읽기 화면의 관리 버튼은 slug로 들어온다. id로 바꿔 이 주소로 다시 보낸다.
  if (!UUID.test(id)) {
    const found = await findIdBySlug(decodeURIComponent(id));
    if (!found) notFound();
    redirect(`/admin/a/${found}`);
  }
  const a = await getArticle(id);
  if (!a) notFound();
  const [tagNames, usage] = await Promise.all([getTagNames(a.id), getArticleUsage(a.id)]);

  const busy = a.status === "queued" || a.status === "processing";
  const title = recentTitle(a);
  const sourceHref = safeHref(a.sourceUrl);
  const viewable = a.status === "published" && a.isPublic;
  const audioPlan = planAudioChunks(listenBlocks(a));
  const audioGenerating = a.audioStatus === "generating";
  const totals: UsageRow = usage.reduce(
    (t, r) => ({ ...t, calls: t.calls + r.calls, input: t.input + r.input, output: t.output + r.output, cacheRead: t.cacheRead + r.cacheRead }),
    { step: "total", calls: 0, input: 0, output: 0, cacheRead: 0 },
  );

  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-6 md:pt-10">
      <AutoRefresh active={busy || audioGenerating} />
      <Link
        href="/admin"
        className={`-ml-2 mb-4 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
      >
        <ChevronLeftIcon />
        관리 목록
      </Link>

      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <StatusBadge status={a.status} progress={a.progress} />
          <span className="text-[13px] text-[var(--muted)]">{formatDateTime(a.createdAt)} 등록</span>
        </div>
        <h1 className="text-2xl font-bold leading-snug tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {a.titleKo && a.titleOriginal && a.titleOriginal !== a.titleKo && <p className="mt-1.5 text-[15px] text-[var(--muted)]">{a.titleOriginal}</p>}
      </header>

      {a.status === "failed" && (
        <div
          role="alert"
          className="mb-6 flex gap-3 rounded-xl border border-l-[3px] border-[var(--line)] border-l-[var(--accent)] bg-[var(--summary-bg)] px-4 py-3 text-sm leading-relaxed"
        >
          <span className="mt-0.5 shrink-0 text-[var(--accent)]">
            <AlertIcon />
          </span>
          <div className="min-w-0">
            <p className="[overflow-wrap:anywhere]">{a.error ?? "처리 중 오류가 났어요."}</p>
            {a.failedStep && <p className="mt-0.5 text-[13px] text-[var(--muted)]">실패한 단계: {STEP_LABEL[a.failedStep] ?? a.failedStep}</p>}
          </div>
        </div>
      )}

      {viewable && (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row">
          <Link href={`/a/${a.slug}`} className={linkButton}>
            공개 글 보기
          </Link>
          <Link href={`/a/${a.slug}/read`} className={linkButton}>
            듣기 화면 열기
          </Link>
        </div>
      )}

      {!busy && (a.bodyKo ?? a.bodyOriginal) && (
        <div className="mb-6">
          <Link href={`/admin/a/${a.id}/edit`} className={linkButton}>
            제목·본문 편집
          </Link>
        </div>
      )}

      {a.status === "published" && !a.isPublic && (
        <div className="mb-6 flex flex-col gap-3">
          <Link href={`/a/${a.slug}`} className={linkButton}>
            비공개 글 보기
          </Link>
          <ListenLinkCopy id={a.id} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        <section aria-labelledby="info-heading" className={card}>
          <h2 id="info-heading" className={sectionTitle}>
            정보
          </h2>
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-[var(--muted)]">종류</dt>
            <dd>{SOURCE_LABEL[a.sourceType] ?? a.sourceType}</dd>
            {a.sourceUrl && (
              <>
                <dt className="text-[var(--muted)]">출처</dt>
                <dd className="min-w-0">
                  {sourceHref ? (
                    <a href={sourceHref} target="_blank" rel="noopener nofollow" className="inline-flex max-w-full items-center gap-1 break-all underline-offset-2 hover:underline">
                      <span className="truncate">{a.sourceUrl}</span>
                      <ExternalIcon />
                    </a>
                  ) : (
                    <span className="break-all">{a.sourceUrl}</span>
                  )}
                </dd>
              </>
            )}
            {a.sourceFileName && (
              <>
                <dt className="text-[var(--muted)]">파일</dt>
                <dd className="break-all">{a.sourceFileName}</dd>
              </>
            )}
            <dt className="text-[var(--muted)]">언어</dt>
            <dd>{a.lang ? (LANG_LABEL[a.lang] ?? a.lang) : "—"}</dd>
            {busy && (
              <>
                <dt className="text-[var(--muted)]">진행</dt>
                <dd>{a.progress ?? "대기 중"}</dd>
              </>
            )}
            {a.publishedAt && (
              <>
                <dt className="text-[var(--muted)]">게시</dt>
                <dd>{formatDateTime(a.publishedAt)}</dd>
              </>
            )}
            <dt className="text-[var(--muted)]">주소</dt>
            <dd className="break-all font-mono text-[13px]">/a/{a.slug}</dd>
          </dl>
        </section>

        <section aria-label="공개 범위" className={card}>
          <VisibilityToggle id={a.id} isPublic={a.isPublic} />
        </section>

        <section aria-labelledby="tags-heading" className={card}>
          <h2 id="tags-heading" className={sectionTitle}>
            태그
          </h2>
          <TagEditor key={tagNames.join("\u0000")} id={a.id} initial={tagNames} />
        </section>

        <section aria-labelledby="cover-heading" className={card}>
          <h2 id="cover-heading" className={sectionTitle}>
            표지 이미지
          </h2>
          <CoverGenerator id={a.id} cover={safeHref(a.coverImage) ?? null} generated={a.coverGenerated} hasSource={Boolean(a.coverSource)} enabled={!busy && a.status === "published"} />
        </section>

        <section aria-labelledby="audio-heading" className={card}>
          <h2 id="audio-heading" className={sectionTitle}>
            낭독 오디오
          </h2>
          <AudioGenerator
            id={a.id}
            audio={safeHref(a.audioUrl) ?? null}
            stale={a.audioMeta != null && a.audioMeta.hash !== speechHash(audioPlan)}
            chars={audioChars(audioPlan)}
            status={a.audioStatus}
            progress={a.audioProgress}
            error={a.audioError}
            enabled={!busy && a.status === "published" && audioPlan.length > 0}
          />
        </section>

        <section aria-labelledby="related-heading" className={card}>
          <h2 id="related-heading" className={sectionTitle}>
            더 읽어볼 글
          </h2>
          {(a.relatedLinks?.length ?? 0) > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5 text-sm">
              {a.relatedLinks!.map((l) => (
                <li key={l.url} className="truncate">
                  <a href={safeHref(l.url)} target="_blank" rel="noopener nofollow" className="underline-offset-2 hover:underline">
                    {l.titleKo}
                  </a>
                  <span className="text-[var(--muted)]"> · {l.site}</span>
                </li>
              ))}
            </ul>
          )}
          <RelatedRefresh id={a.id} count={a.relatedLinks?.length ?? null} enabled={a.status === "published"} />
        </section>

        <section aria-labelledby="reprocess-heading" className={card}>
          <h2 id="reprocess-heading" className={sectionTitle}>
            다시 처리
          </h2>
          {a.status === "published" && (a.untranslated?.length ?? 0) > 0 && (
            <p className="mb-3 text-sm text-[var(--accent)]">번역 누락 {a.untranslated.length}곳이 있어요.</p>
          )}
          <ReprocessSection id={a.id} options={reprocessOptions(a)} busy={busy} isEnglish={isTranslatable(a.lang)} />
        </section>

        <section aria-labelledby="usage-heading" className={card}>
          <h2 id="usage-heading" className={sectionTitle}>
            사용량
          </h2>
          {usage.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">기록된 사용량이 없어요.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 md:-mx-5 md:px-5">
              <table className="w-full min-w-[480px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[13px] text-[var(--muted)]">
                    <th scope="col" className="py-2 pr-3 font-medium">단계</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">호출</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">입력</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">출력</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">캐시 읽기</th>
                    <th scope="col" className="py-2 text-right font-medium">추정 비용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {usage.map((r) => (
                    <tr key={r.step}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        {STEP_LABEL[r.step] ?? r.step}
                        <span className="ml-1 text-[12px] text-[var(--muted)]">{modelForStep(r.step) === "haiku" ? "Haiku" : "Sonnet"}</span>
                      </th>
                      <td className="py-2 pr-3 text-right">{num.format(r.calls)}</td>
                      <td className="py-2 pr-3 text-right">{num.format(r.input)}</td>
                      <td className="py-2 pr-3 text-right">{num.format(r.output)}</td>
                      <td className="py-2 pr-3 text-right">{num.format(r.cacheRead)}</td>
                      <td className="py-2 text-right">{usd(estimateCostUsd([r]))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--line)] font-semibold">
                    <th scope="row" className="py-2 pr-3 text-left">합계</th>
                    <td className="py-2 pr-3 text-right">{num.format(totals.calls)}</td>
                    <td className="py-2 pr-3 text-right">{num.format(totals.input)}</td>
                    <td className="py-2 pr-3 text-right">{num.format(totals.output)}</td>
                    <td className="py-2 pr-3 text-right">{num.format(totals.cacheRead)}</td>
                    <td className="py-2 text-right">{usd(estimateCostUsd(usage))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">{PRICE_NOTE}</p>
        </section>

        <section aria-labelledby="delete-heading" className="rounded-2xl border border-[color-mix(in_srgb,#dc2626_35%,var(--line))] p-4 md:p-5">
          <h2 id="delete-heading" className={sectionTitle}>
            삭제
          </h2>
          <DeleteSection id={a.id} busy={busy} />
        </section>
      </div>
    </main>
  );
}
