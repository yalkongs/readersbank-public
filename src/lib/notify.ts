// 소유자 기기로 웹 푸시 알림을 보낸다. 알림 실패는 본 작업(발행·실패 기록)에 영향을 주지 않도록 삼킨다.
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { SITE_URL } from "@/lib/site";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };


function configured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(SITE_URL, pub, priv);
  return true;
}

export async function notifyOwner(msg: PushMessage): Promise<number> {
  try {
    if (!configured()) return 0;
    const subs = await db().select().from(pushSubscriptions);
    const payload = JSON.stringify({ ...msg, body: msg.body.slice(0, 300) });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 만료·해지된 구독은 지운다.
          if (status === 404 || status === 410) await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          else console.error("[notify] 전송 실패", status ?? (err instanceof Error ? err.message : err));
        }
      }),
    );
    return sent;
  } catch (err) {
    console.error("[notify] 알림 준비 실패", err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function saveSubscription(sub: { endpoint: string; p256dh: string; auth: string; label?: string }): Promise<void> {
  await db()
    .insert(pushSubscriptions)
    .values(sub)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: sub.p256dh, auth: sub.auth, label: sub.label } });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function countSubscriptions(): Promise<number> {
  return (await db().select({ id: pushSubscriptions.id }).from(pushSubscriptions)).length;
}
