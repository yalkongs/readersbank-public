import { listForAdmin } from "@/lib/articles/repo";
import { recentTitle } from "@/lib/ingest-ui";
import { IngestForm } from "./IngestForm";
import { RecentSubmissions, type RecentRow } from "./RecentSubmissions";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const recent: RecentRow[] = (await listForAdmin({ limit: 3 })).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: recentTitle(r),
    status: r.status,
    progress: r.progress,
    isPublic: r.isPublic,
  }));
  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-8 md:pt-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight">새 글</h1>
      <IngestForm />
      <div className="mt-12">
        <RecentSubmissions rows={recent} />
      </div>
    </main>
  );
}
