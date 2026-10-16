import { describe, expect, it } from "vitest";
import { MAX_MULTIPART_BODY_BYTES, bodyTooLarge, sanitizeUploadName } from "@/lib/multipart";

describe("sanitizeUploadName", () => {
  it("replaces path and url-special characters and control chars", () => {
    expect(sanitizeUploadName("a/b\\c?d#e%f\u0001g.txt")).toBe("a_b_c_d_e_f_g.txt");
  });
  it("trims, caps to last 100 chars, and falls back to upload", () => {
    expect(sanitizeUploadName("  x.md  ")).toBe("x.md");
    const long = "a".repeat(150) + ".pdf";
    const out = sanitizeUploadName(long);
    expect(out.length).toBe(100);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(sanitizeUploadName("   ")).toBe("upload");
    expect(sanitizeUploadName("")).toBe("upload");
  });
});

describe("bodyTooLarge", () => {
  it("is true only when Content-Length exceeds the limit", () => {
    expect(bodyTooLarge(String(MAX_MULTIPART_BODY_BYTES + 1))).toBe(true);
    expect(bodyTooLarge(String(MAX_MULTIPART_BODY_BYTES))).toBe(false);
    expect(bodyTooLarge(null)).toBe(false);
    expect(bodyTooLarge("abc")).toBe(false);
  });
});
