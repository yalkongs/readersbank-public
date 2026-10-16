import { timingSafeEqual } from "node:crypto";
import { notifyOwner } from "@/lib/notify";
import { weeklySummary } from "@/lib/weekly-summary";

export const dynamic = "force-dynamic";

// Vercel Cron이 CRON_SECRET을 Bearer로 붙여 부른다(vercel.json crons). 그 밖의 호출은 거절한다.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const have = Buffer.from(got);
  return want.length === have.length && timingSafeEqual(want, have);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const s = await weeklySummary();
  const sent = await notifyOwner({ title: "ReadersBank 주간 요약", body: s.body, url: "/admin", tag: "weekly" });
  return Response.json({ ...s, sent });
}
