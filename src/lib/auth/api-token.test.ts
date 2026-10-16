import { describe, expect, it } from "vitest";
import { generateToken, hashToken, parseBearer, tokensMatch, TOKEN_PATTERN } from "@/lib/auth/api-token";

describe("api token primitives", () => {
  it("generates rb_ + 43 base64url chars (32 bytes), unique each time", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^rb_[A-Za-z0-9_-]{43}$/);
    expect(TOKEN_PATTERN.test(a)).toBe(true);
    expect(a).not.toBe(b);
  });
  it("hashes to deterministic 64-char hex SHA-256 that is not the plaintext", () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
  it("parses only well-formed Bearer headers", () => {
    const t = generateToken();
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer ${t}`)).toBe(t);
    expect(parseBearer(t)).toBeNull();
    expect(parseBearer(`Bearer ${t} extra`)).toBeNull();
    expect(parseBearer("Bearer garbage")).toBeNull();
    expect(parseBearer("Bearer rb_short")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
  });
  it("compares hashes in constant time and rejects length mismatch", () => {
    const h = hashToken(generateToken());
    expect(tokensMatch(h, h)).toBe(true);
    expect(tokensMatch(h, hashToken(generateToken()))).toBe(false);
    expect(tokensMatch(h, h.slice(1))).toBe(false);
    expect(tokensMatch(h, "")).toBe(false);
  });
});
