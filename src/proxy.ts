import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, readSession, SESSION_COOKIE, sessionCookieOptions, shouldRenew } from "@/lib/auth/session";
import { INTRO_COOKIE, introCookieOptions, shouldShowIntro } from "@/lib/intro";

// 홈: 처음 온 사람은 소개로 보낸다. 소개: 한 번 열면 다시 보내지 않도록 표시한다.
async function intro(request: NextRequest): Promise<NextResponse> {
  const seen = request.cookies.has(INTRO_COOKIE);
  if (request.nextUrl.pathname === "/about") {
    const res = NextResponse.next();
    if (!seen) res.cookies.set(INTRO_COOKIE, "1", introCookieOptions());
    return res;
  }
  if (seen) return NextResponse.next();
  const signedIn = (await readSession(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "")).valid;
  if (!shouldShowIntro({ method: request.method, headers: request.headers, hasIntroCookie: seen, signedIn })) return NextResponse.next();
  const res = NextResponse.redirect(new URL("/about", request.url), 307);
  res.cookies.set(INTRO_COOKIE, "1", introCookieOptions());
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname === "/about") return intro(request);
  if (pathname === "/admin/login") return NextResponse.next();
  // API 토큰은 /api/ingest에서만 통한다. 여기서는 형식만 보고 통과시키고 검증은 라우트가 맡는다.
  // 다른 경로(관리 화면·/api/upload)는 Bearer 헤더가 있어도 세션이 필요하다.
  if (pathname === "/api/ingest" && /^Bearer rb_\S+$/i.test(request.headers.get("authorization")?.trim() ?? "")) {
    return NextResponse.next();
  }
  const secret = process.env.SESSION_SECRET ?? "";
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (session.valid) {
    const res = NextResponse.next();
    if (session.issuedAt === undefined || shouldRenew(session.issuedAt, Math.floor(Date.now() / 1000))) {
      res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), sessionCookieOptions());
    }
    return res;
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/", "/about", "/admin/:path*", "/api/ingest", "/api/upload"],
};
