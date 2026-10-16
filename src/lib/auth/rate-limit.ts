import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

export type AttemptState = { count: number; windowStart: Date; blockedUntil: Date | null };

export function isBlocked(state: AttemptState | null, now: Date): boolean {
  return !!state?.blockedUntil && state.blockedUntil.getTime() > now.getTime();
}

/**
 * 로그인 시도 1회를 "먼저 예약"한 뒤의 다음 상태를 계산하는 순수 함수(테스트용).
 * 런타임의 진실 공급원은 reserveLoginAttempt의 단일 SQL(INSERT ... ON CONFLICT DO UPDATE ... RETURNING)이며,
 * 그 SQL은 이 함수와 같은 규칙을 원자적으로 수행한다. 규칙을 바꿀 때는 둘을 함께 고친다.
 *  - 모든 시도는 비밀번호 비교 전에 count에 반영된다(성공 시 키를 지운다).
 *  - 창(15분)이 만료됐고 차단 중이 아니면 count=1로 새 창을 시작한다.
 *  - 차단 중이면 count만 늘리고 blockedUntil/windowStart는 그대로 둔다.
 *  - 그 외에는 count+1, 10회에 도달하면 now+15분까지 차단한다.
 * 비밀번호 비교는 isAttemptAllowed(결과)가 true일 때만 한다(count <= 10 → 최대 10번 비교).
 */
export function nextAttemptState(prev: AttemptState | null, now: Date): AttemptState {
  if (!prev) return { count: 1, windowStart: now, blockedUntil: null };
  if (isBlocked(prev, now)) return { ...prev, count: prev.count + 1 };
  if (prev.windowStart.getTime() + WINDOW_MS <= now.getTime()) {
    return { count: 1, windowStart: now, blockedUntil: null };
  }
  const count = prev.count + 1;
  return {
    count,
    windowStart: prev.windowStart,
    blockedUntil: count >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null,
  };
}

export function isAttemptAllowed(state: AttemptState): boolean {
  return state.count <= MAX_FAILURES;
}

/**
 * 시도를 원자적으로 예약하고 비밀번호를 비교해도 되는지 반환한다.
 * DB 오류 시에는 fail-open(허용)하고 로그만 남긴다: 단일 소유자 앱이며 관리자 기능 자체가 DB에 의존하므로
 * 제한기 장애로 소유자가 잠기는 것보다 낫다. 비밀번호 확인은 그대로 수행된다.
 */
export async function reserveLoginAttempt(key: string, now: Date = new Date()): Promise<boolean> {
  try {
    const n = now.toISOString();
    const window = `${WINDOW_MS / 1000} seconds`;
    const lock = `${LOCK_MS / 1000} seconds`;
    const active = sql`${loginAttempts.blockedUntil} > ${n}::timestamptz`;
    const expired = sql`${loginAttempts.windowStart} + ${window}::interval <= ${n}::timestamptz`;
    const [row] = await db()
      .insert(loginAttempts)
      .values({ key, count: 1, windowStart: now, blockedUntil: null })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`CASE WHEN NOT coalesce(${active}, false) AND ${expired} THEN 1 ELSE ${loginAttempts.count} + 1 END`,
          windowStart: sql`CASE WHEN NOT coalesce(${active}, false) AND ${expired} THEN ${n}::timestamptz ELSE ${loginAttempts.windowStart} END`,
          blockedUntil: sql`CASE WHEN coalesce(${active}, false) THEN ${loginAttempts.blockedUntil} WHEN ${expired} THEN NULL WHEN ${loginAttempts.count} + 1 >= ${MAX_FAILURES} THEN ${n}::timestamptz + ${lock}::interval ELSE NULL END`,
        },
      })
      .returning({ count: loginAttempts.count });
    return row.count <= MAX_FAILURES;
  } catch (e) {
    console.error("login rate limiter unavailable (fail-open):", e instanceof Error ? e.message : "unknown error");
    return true;
  }
}

export async function clearLoginAttempts(key: string): Promise<void> {
  try {
    await db().delete(loginAttempts).where(eq(loginAttempts.key, key));
  } catch (e) {
    console.error("login rate limiter clear failed (fail-open):", e instanceof Error ? e.message : "unknown error");
  }
}
