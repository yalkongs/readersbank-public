import { createHash, timingSafeEqual } from "node:crypto";

export function checkPassword(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return input.length > 0 && timingSafeEqual(a, b);
}
