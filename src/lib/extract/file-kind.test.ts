import { describe, expect, it } from "vitest";
import { canonicalContentType, fileKind } from "./file-kind";

describe("canonicalContentType", () => {
  it.each([
    ["text", "text/plain"],
    ["md", "text/markdown"],
    ["html", "text/html"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["pdf", "application/pdf"],
  ] as const)("%s -> %s", (kind, type) => {
    expect(canonicalContentType(kind)).toBe(type);
  });

  it("round-trips through fileKind", () => {
    for (const kind of ["text", "md", "html", "docx", "pdf"] as const) expect(fileKind("noext", canonicalContentType(kind))).toBe(kind);
  });
});
