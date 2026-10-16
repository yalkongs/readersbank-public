import { and, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, llmUsage } from "@/db/schema";
import { estimateCostUsd, type UsageRow } from "@/lib/usage";

// 지난 7일 요약: 새로 게시된 글, 실패한 글, LLM 추정 비용(웹 검색 요금 제외).
export async function weeklySummary(now = new Date()): Promise<{ published: number; failed: number; costUsd: number; body: string }> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [counts] = await db()
    .select({
      published: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${since.toISOString()}::timestamptz)::int`,
      failed: sql<number>`count(*) filter (where ${articles.status} = 'failed' and ${articles.createdAt} >= ${since.toISOString()}::timestamptz)::int`,
    })
    .from(articles);
  const usage: UsageRow[] = await db()
    .select({
      step: llmUsage.step,
      input: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::int`,
      output: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::int`,
      cacheRead: sql<number>`coalesce(sum(${llmUsage.cacheReadTokens}), 0)::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(llmUsage)
    .where(and(gte(llmUsage.createdAt, since)))
    .groupBy(llmUsage.step);
  const costUsd = estimateCostUsd(usage);
  const body = formatWeekly(counts.published, counts.failed, costUsd);
  return { published: counts.published, failed: counts.failed, costUsd, body };
}

export function formatWeekly(published: number, failed: number, costUsd: number): string {
  const parts = [`새 글 ${published}편`];
  if (failed > 0) parts.push(`실패 ${failed}건`);
  parts.push(`추정 비용 $${costUsd.toFixed(2)}`);
  return parts.join(" · ");
}
