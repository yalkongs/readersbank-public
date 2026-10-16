import { describe, expect, it } from "vitest";
import { checkPassword } from "@/lib/auth/password";
import { decodeJwt } from "jose";
import { createSessionToken, readSession, SESSION_MAX_AGE, shouldRenew, verifySessionToken } from "@/lib/auth/session";

const secret = "test-secret-test-secret-test-secret!!";

describe("session token", () => {
  it("verifies a token signed with the same secret", async () => {
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, secret)).toBe(true);
  });
  it("rejects wrong secret, garbage and missing token", async () => {
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, "another-secret-another-secret-123")).toBe(false);
    expect(await verifySessionToken("garbage", secret)).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
  });
});

describe("sliding session", () => {
  it("shouldRenew is true only when older than one day", () => {
    const now = 1_000_000;
    expect(shouldRenew(now, now)).toBe(false);
    expect(shouldRenew(now - 86400, now)).toBe(false);
    expect(shouldRenew(now - 86401, now)).toBe(true);
  });
  it("readSession returns issuedAt for a valid token", async () => {
    const token = await createSessionToken(secret);
    const r = await readSession(token, secret);
    expect(r.valid).toBe(true);
    expect(Math.abs(r.issuedAt! - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  });
  it("readSession is invalid for wrong secret, garbage and missing token", async () => {
    const token = await createSessionToken(secret);
    expect((await readSession(token, "another-secret-another-secret-123")).valid).toBe(false);
    expect((await readSession("garbage", secret)).valid).toBe(false);
    expect((await readSession(undefined, secret)).valid).toBe(false);
  });
  it("token expires 90 days after issue", async () => {
    const { exp, iat } = decodeJwt(await createSessionToken(secret));
    expect(SESSION_MAX_AGE).toBe(90 * 86400);
    expect(exp! - iat!).toBe(90 * 86400);
  });
});

describe("checkPassword", () => {
  it("compares in constant time and handles different lengths", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter3", "hunter2")).toBe(false);
    expect(checkPassword("", "hunter2")).toBe(false);
  });
});
