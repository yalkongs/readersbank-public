import { describe, expect, it } from "vitest";
import { describeInput, fileBadge, formatBytes, previewTitle, recentTitle, statusLabel } from "@/lib/ingest-ui";

describe("formatBytes", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(12_800)).toBe("13 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(3.45 * 1024 * 1024)).toBe("3.5 MB");
  });
});

describe("describeInput", () => {
  it("returns null for blank input", () => {
    expect(describeInput("")).toBeNull();
    expect(describeInput("   \n ")).toBeNull();
  });
  it("labels web pages and notion links", () => {
    expect(describeInput(" https://example.com/a ")).toEqual({ kind: "url", label: "웹 페이지" });
    expect(describeInput("https://x.notion.site/Doc-1")).toEqual({ kind: "notion", label: "Notion" });
  });
  it("labels text with a grouped character count of the trimmed text", () => {
    expect(describeInput("  안녕하세요  ")).toEqual({ kind: "text", label: "텍스트 · 5자" });
    expect(describeInput("a".repeat(1240))).toEqual({ kind: "text", label: "텍스트 · 1,240자" });
  });
});

describe("statusLabel", () => {
  it("maps each status to a label and tone", () => {
    expect(statusLabel({ status: "queued", progress: null })).toEqual({ label: "대기", tone: "muted" });
    expect(statusLabel({ status: "processing", progress: null })).toEqual({ label: "처리 중", tone: "accent" });
    expect(statusLabel({ status: "processing", progress: "번역 2/5" })).toEqual({ label: "처리 중 · 번역 2/5", tone: "accent" });
    expect(statusLabel({ status: "published", progress: "완료" })).toEqual({ label: "게시됨", tone: "success" });
    expect(statusLabel({ status: "failed", progress: null })).toEqual({ label: "실패", tone: "danger" });
  });
});

describe("recentTitle", () => {
  const base = { slug: "abc123", titleKo: null, titleOriginal: null, sourceUrl: null, sourceFileName: null };
  it("prefers Korean title, then original, then url host, then file name, then slug", () => {
    expect(recentTitle({ ...base, titleKo: "한글", titleOriginal: "Eng" })).toBe("한글");
    expect(recentTitle({ ...base, titleOriginal: "Eng" })).toBe("Eng");
    expect(recentTitle({ ...base, sourceUrl: "https://www.example.com/x/y" })).toBe("www.example.com");
    expect(recentTitle({ ...base, sourceFileName: "report.pdf" })).toBe("report.pdf");
    expect(recentTitle(base)).toBe("abc123");
  });
  it("falls back to the raw url when it cannot be parsed", () => {
    expect(recentTitle({ ...base, sourceUrl: "not a url" })).toBe("not a url");
  });
});

describe("previewTitle", () => {
  it("uses file name, url host, or the first 40 characters", () => {
    expect(previewTitle("ignored", "doc.pdf")).toBe("doc.pdf");
    expect(previewTitle("https://blog.example.com/post", null)).toBe("blog.example.com");
    expect(previewTitle("https://www.notion.so/Page-1", null)).toBe("www.notion.so");
    expect(previewTitle("  짧은 글  ", null)).toBe("짧은 글");
    const long = "가".repeat(50);
    expect(previewTitle(long, null)).toBe(`${"가".repeat(40)}…`);
  });
  it("collapses whitespace in text previews", () => {
    expect(previewTitle("첫 줄\n\n둘째   줄", null)).toBe("첫 줄 둘째 줄");
  });
});

describe("fileBadge", () => {
  it("gives a short label per kind", () => {
    expect(fileBadge("pdf")).toBe("PDF");
    expect(fileBadge("docx")).toBe("DOCX");
    expect(fileBadge("html")).toBe("HTML");
    expect(fileBadge("md")).toBe("MD");
    expect(fileBadge("text")).toBe("TXT");
  });
});
