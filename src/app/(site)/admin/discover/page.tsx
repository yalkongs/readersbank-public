import { normalizeTopic } from "@/lib/discover";
import { DiscoverClient } from "./DiscoverClient";

// 웹 검색(여러 번)을 기다리는 서버 액션이 이 경로에서 돈다.
export const maxDuration = 120;

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const topic = normalizeTopic(Array.isArray(q) ? q[0] : q) ?? "";
  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-8 md:pt-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">주제로 글 찾기</h1>
      <DiscoverClient key={topic} initialTopic={topic} />
    </main>
  );
}
