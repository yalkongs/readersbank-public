import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiTokens, type ApiToken } from "@/db/schema";

// 형식: rb_ + 32바이트 base64url(43자). /api/ingest 전용이며 관리 동작에는 쓸 수 없다.
export const TOKEN_PATTERN = /^rb_[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return `rb_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 같은 길이의 버퍼끼리만 상수 시간 비교한다.
export function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer ([^\s]+)$/i.exec(header.trim());
  if (!m || !TOKEN_PATTERN.test(m[1])) return null;
  return m[1];
}

export async function createApiToken(name: string): Promise<{ id: string; plaintext: string }> {
  const plaintext = generateToken();
  const [row] = await db()
    .insert(apiTokens)
    .values({ name: name.trim().slice(0, 60) || "이름 없는 토큰", tokenHash: hashToken(plaintext) })
    .returning({ id: apiTokens.id });
  return { id: row.id, plaintext };
}

// 유효한 Bearer 토큰이면 토큰 id를 돌려주고 마지막 사용 시각을 갱신한다. 폐기된 토큰·형식 오류는 null.
export async function verifyApiToken(header: string | null | undefined): Promise<string | null> {
  const token = parseBearer(header);
  if (!token) return null;
  const hash = hashToken(token);
  const [row] = await db()
    .select({ id: apiTokens.id, tokenHash: apiTokens.tokenHash })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row || !tokensMatch(row.tokenHash, hash)) return null;
  await db().update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  return row.id;
}

export async function revokeApiToken(id: string): Promise<void> {
  await db().update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)));
}

export async function listApiTokens(): Promise<ApiToken[]> {
  return db().select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
}
