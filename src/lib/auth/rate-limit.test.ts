import { describe, expect, it } from "vitest";
import { isAttemptAllowed, isBlocked, LOCK_MS, MAX_FAILURES, nextAttemptState, WINDOW_MS, type AttemptState } from "@/lib/auth/rate-limit";

const t0 = new Date("2026-10-11T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

function failN(n: number, start: AttemptState | null = null, step = 1000) {
  let s = start;
  for (let i = 0; i < n; i++) s = nextAttemptState(s, at(i * step));
  return s!;
}

describe("nextAttemptState", () => {
  it("starts a window on first failure", () => {
    expect(nextAttemptState(null, t0)).toEqual({ count: 1, windowStart: t0, blockedUntil: null });
  });
  it("counts failures inside the window without blocking before the limit", () => {
    const s = failN(MAX_FAILURES - 1);
    expect(s.count).toBe(MAX_FAILURES - 1);
    expect(s.blockedUntil).toBeNull();
  });
  it("blocks for 15 minutes when the 10th failure lands", () => {
    const s = failN(MAX_FAILURES);
    expect(s.count).toBe(MAX_FAILURES);
    expect(s.blockedUntil).toEqual(at((MAX_FAILURES - 1) * 1000 + LOCK_MS));
  });
  it("resets the window once it has expired", () => {
    const prev = failN(5);
    const now = at(WINDOW_MS + 1);
    expect(nextAttemptState(prev, now)).toEqual({ count: 1, windowStart: now, blockedUntil: null });
  });
  it("keeps counting but never extends the block while it is active", () => {
    const blocked = failN(MAX_FAILURES);
    expect(nextAttemptState(blocked, at(60_000))).toEqual({ ...blocked, count: MAX_FAILURES + 1 });
  });
  it("allows exactly the first 10 attempts to compare the password", () => {
    expect(isAttemptAllowed(failN(MAX_FAILURES))).toBe(true);
    expect(isAttemptAllowed(failN(MAX_FAILURES + 1))).toBe(false);
    expect(isAttemptAllowed(nextAttemptState(null, t0))).toBe(true);
  });
  it("starts fresh after the block expires", () => {
    const blocked = failN(MAX_FAILURES);
    const now = new Date(blocked.blockedUntil!.getTime() + 1);
    expect(nextAttemptState(blocked, now)).toEqual({ count: 1, windowStart: now, blockedUntil: null });
  });
});

describe("isBlocked", () => {
  it("is true only before blockedUntil", () => {
    const blocked = failN(MAX_FAILURES);
    expect(isBlocked(blocked, at(60_000))).toBe(true);
    expect(isBlocked(blocked, blocked.blockedUntil!)).toBe(false);
    expect(isBlocked(null, t0)).toBe(false);
    expect(isBlocked(failN(3), t0)).toBe(false);
  });
});
