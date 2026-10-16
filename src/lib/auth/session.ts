import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "rb_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90;
const RENEW_AFTER_SECONDS = 60 * 60 * 24;

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret: string): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key(secret));
}

export async function readSession(
  token: string | undefined,
  secret: string,
): Promise<{ valid: boolean; issuedAt?: number }> {
  if (!token) return { valid: false };
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (payload.sub !== "owner") return { valid: false };
    return { valid: true, issuedAt: payload.iat };
  } catch {
    return { valid: false };
  }
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  return (await readSession(token, secret)).valid;
}

/** True when the token was issued more than one day before `now` (both in epoch seconds). */
export function shouldRenew(issuedAt: number, now: number): boolean {
  return now - issuedAt > RENEW_AFTER_SECONDS;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function isOwner(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  return Boolean(secret) && verifySessionToken(token, secret!);
}
