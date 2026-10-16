import { createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const READ_TOKEN_TTL_SECONDS = 60 * 60 * 24;

type Opts = { secret?: string; now?: number };

// 세션 토큰과 서명 키를 분리한다: HMAC(SESSION_SECRET, "read-link").
function key(secret: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", secret).update("read-link").digest());
}

/** 비공개 글을 /read?t= 로 24시간 동안 열 수 있는 서명 토큰. */
export async function signReadToken(articleId: string, opts: Opts = {}): Promise<string> {
  const secret = opts.secret ?? process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET이 설정되지 않았습니다");
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: articleId, purpose: "read" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + READ_TOKEN_TTL_SECONDS)
    .sign(key(secret));
}

/** 서명·만료·목적(read)·글 일치를 모두 확인한다. 어떤 실패든 false. */
export async function verifyReadToken(token: string | undefined, articleId: string, opts: Opts = {}): Promise<boolean> {
  const secret = opts.secret ?? process.env.SESSION_SECRET;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "sub"],
      subject: articleId,
      currentDate: opts.now === undefined ? undefined : new Date(opts.now * 1000),
    });
    return payload.purpose === "read" && payload.sub === articleId;
  } catch {
    return false;
  }
}
