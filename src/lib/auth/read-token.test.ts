import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createHmac } from "node:crypto";
import { READ_TOKEN_TTL_SECONDS, signReadToken, verifyReadToken } from "@/lib/auth/read-token";

const secret = "test-secret-test-secret-test-secret!!";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("read token", () => {
  it("verifies a fresh token for the same article", async () => {
    const t = await signReadToken(A, { secret });
    expect(await verifyReadToken(t, A, { secret })).toBe(true);
  });
  it("rejects a token for another article", async () => {
    const t = await signReadToken(A, { secret });
    expect(await verifyReadToken(t, B, { secret })).toBe(false);
  });
  it("rejects a token with the wrong purpose", async () => {
    const key = createHmac("sha256", secret).update("read-link").digest();
    const t = await new SignJWT({ sub: A, purpose: "session" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key);
    expect(await verifyReadToken(t, A, { secret })).toBe(false);
  });
  it("rejects a token signed with the raw secret (not the derived key)", async () => {
    const t = await new SignJWT({ sub: A, purpose: "read" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    expect(await verifyReadToken(t, A, { secret })).toBe(false);
  });
  it("expires after 24 hours", async () => {
    const now = 1_700_000_000;
    const t = await signReadToken(A, { secret, now });
    expect(await verifyReadToken(t, A, { secret, now: now + READ_TOKEN_TTL_SECONDS - 1 })).toBe(true);
    expect(await verifyReadToken(t, A, { secret, now: now + READ_TOKEN_TTL_SECONDS + 1 })).toBe(false);
  });
  it("rejects tampered, wrong-secret, garbage and missing tokens", async () => {
    const t = await signReadToken(A, { secret });
    const [h, p, s] = t.split(".");
    expect(await verifyReadToken(`${h}.${p}.${s.slice(0, -2)}xx`, A, { secret })).toBe(false);
    expect(await verifyReadToken(t, A, { secret: "another-secret-another-secret-123" })).toBe(false);
    expect(await verifyReadToken("garbage", A, { secret })).toBe(false);
    expect(await verifyReadToken(undefined, A, { secret })).toBe(false);
    expect(await verifyReadToken(t, A, { secret: "" })).toBe(false);
  });
});
