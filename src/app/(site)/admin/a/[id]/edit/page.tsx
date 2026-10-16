import Link from "next/link";
import { notFound } from "next/navigation";
import { bodyToMarkdown, editedBodyField } from "@/lib/articles/edit";
import { getArticle } from "@/lib/articles/repo";
import { ChevronLeftIcon, focusRing } from "../../../ui";
import { EditForm } from "./EditForm";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const a = await getArticle(id);
  if (!a) notFound();
  const busy = a.status === "queued" || a.status === "processing";
  const field = editedBodyField(a);
  const markdown = bodyToMarkdown(a[field] ?? []);

  return (
    <main className="mx-auto max-w-[720px] px-5 pb-32 pt-6 md:pt-10">
      <Link
        href={`/admin/a/${a.id}`}
        className={`-ml-2 mb-4 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
      >
        <ChevronLeftIcon />
        글 관리
      </Link>
      <h1 className="mb-2 text-2xl font-bold tracking-tight">제목·본문 편집</h1>
      <p className="mb-6 text-sm leading-relaxed text-[var(--muted)]">다시 처리하면 편집한 내용은 사라져요.</p>
      {busy ? (
        <p role="alert" className="rounded-xl border border-[var(--line)] bg-[var(--summary-bg)] px-4 py-3 text-sm">
          처리 중인 글은 편집할 수 없어요. 처리가 끝난 뒤 다시 열어 주세요.
        </p>
      ) : (
        <EditForm id={a.id} slug={a.slug} initialTitle={a.titleKo ?? a.titleOriginal ?? ""} initialBody={markdown} />
      )}
    </main>
  );
}
