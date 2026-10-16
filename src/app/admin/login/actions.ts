"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/auth/password";
import { clearLoginAttempts, reserveLoginAttempt } from "@/lib/auth/rate-limit";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { env } from "@/lib/env";

// Vercel은 x-forwarded-for를 클라이언트 값 그대로 두지 않고 직접 설정/덮어쓰므로 첫 값을 신뢰한다.
// 그 외 환경에서는 x-real-ip, 둘 다 없으면 "unknown"(하나의 버킷으로 묶임).
// 주의: 이 제한기는 Vercel에서만 유효하다. Vercel 밖에서는 첫 XFF 값을 클라이언트가 마음대로 정할 수 있다.
async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const key = await clientKey();
  // 비교 전에 시도를 원자적으로 예약한다(병렬 요청이 동시에 통과하지 못함). 한도 초과/차단 중이면
  // 비밀번호를 비교하지 않고, 맞든 틀리든 같은 응답을 준다. 제한기 DB 오류는 fail-open(로그만 남김).
  if (!(await reserveLoginAttempt(key))) {
    await new Promise((r) => setTimeout(r, 1000));
    redirect("/admin/login?error=locked");
  }
  if (!checkPassword(password, env("ADMIN_PASSWORD"))) {
    await new Promise((r) => setTimeout(r, 1000));
    redirect("/admin/login?error=1");
  }
  await clearLoginAttempts(key);
  const token = await createSessionToken(env("SESSION_SECRET"));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect("/admin");
}
