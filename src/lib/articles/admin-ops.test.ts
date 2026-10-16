import { describe, expect, it } from "vitest";
import { ConflictError, collectBlobUrls, isReprocessAllowed, parseAdminFilter, planReprocess, reprocessOptions, validateAdminTags } from "@/lib/articles/admin-ops";
import type { Block } from "@/lib/blocks";

const B = "https://abc123.public.blob.vercel-storage.com";

describe("planReprocess", () => {
  it("resume clears only run state", () => {
    expect(planReprocess("failed", "resume")).toEqual({ status: "queued", error: null, failedStep: null, progress: null });
  });
  it("retranslate also clears translation output", () => {
    expect(planReprocess("published", "retranslate")).toEqual({
      status: "queued", error: null, failedStep: null, progress: null,
      bodyKo: null, untranslated: [], titleKo: null, leadKo: null, summaryKo: null,
    });
  });
  it("full also clears the extracted original and cover", () => {
    const p = planReprocess("failed", "full");
    expect(p).toMatchObject({ bodyOriginal: null, coverImage: null, bodyKo: null, status: "queued" });
  });
  it("full also forgets AI-cover state so the re-extracted cover counts as the source cover", () => {
    expect(planReprocess("published", "full")).toMatchObject({ coverGenerated: false, coverPlan: null, coverSource: null });
  });
  it.each(["queued", "processing"] as const)("throws ConflictError when %s", (s) => {
    expect(() => planReprocess(s, "resume")).toThrow(ConflictError);
  });
});

describe("collectBlobUrls", () => {
  const fig = (src: string): Block => ({ type: "figure", src });
  it("collects the uploaded source file and this article's own figures/cover; dedupes; ignores external and null", () => {
    const urls = collectBlobUrls({
      id: "a",
      sourceFileBlob: `${B}/uploads/src-abc.pdf`,
      coverImage: `${B}/images/a/1.png`,
      bodyOriginal: [fig(`${B}/images/a/1.png`), fig("https://example.com/x.png"), { type: "divider" }],
      bodyKo: [fig(`${B}/images/a/2.png`)],
    });
    expect(urls.sort()).toEqual([`${B}/images/a/1.png`, `${B}/images/a/2.png`, `${B}/uploads/src-abc.pdf`]);
  });
  it("never collects blobs that belong to another article", () => {
    const urls = collectBlobUrls({
      id: "a",
      sourceFileBlob: null,
      coverImage: `${B}/images/other/cover.png`,
      bodyOriginal: [fig(`${B}/images/other/x.png`), fig(`${B}/images/ab/x.png`), fig(`${B}/1.png`)],
      bodyKo: null,
    });
    expect(urls).toEqual([]);
  });
  it("ignores a source file blob outside /uploads/", () => {
    expect(collectBlobUrls({ id: "a", sourceFileBlob: `${B}/src.pdf`, coverImage: null, bodyOriginal: null, bodyKo: null })).toEqual([]);
    expect(collectBlobUrls({ id: "a", sourceFileBlob: `${B}/images/other/doc.pdf`, coverImage: null, bodyOriginal: null, bodyKo: null })).toEqual([]);
  });
  it("rejects encoded separators/dot segments but keeps percent-encoded Korean filenames", () => {
    const urls = collectBlobUrls({
      id: "a",
      sourceFileBlob: `${B}/uploads/..%2Fimages%2Fother%2Fx.png`,
      coverImage: `${B}/images/a/..%2Fother%2Fx.png`,
      bodyOriginal: [fig(`${B}/images/a/%2e%2e/other/x.png`), fig(`${B}/images/a/x%5C..%5Cy.png`)],
      bodyKo: null,
    });
    expect(urls).toEqual([]);
    const korean = `${B}/uploads/${encodeURIComponent("문서")}-abc.pdf`;
    expect(collectBlobUrls({ id: "a", sourceFileBlob: korean, coverImage: null, bodyOriginal: null, bodyKo: null })).toEqual([korean]);
  });
  it("also collects the kept source cover behind an AI cover", () => {
    const src = `${B}/images/a/cover-src.jpg`;
    const ai = `${B}/images/a/cover-ai.jpg`;
    expect(collectBlobUrls({ id: "a", sourceFileBlob: null, coverImage: ai, coverSource: src, bodyOriginal: null, bodyKo: null })).toEqual([ai, src]);
    expect(collectBlobUrls({ id: "a", sourceFileBlob: null, coverImage: ai, coverSource: `${B}/images/other/x.jpg`, bodyOriginal: null, bodyKo: null })).toEqual([ai]);
  });
  it("handles all-null", () => {
    expect(collectBlobUrls({ id: "a", sourceFileBlob: null, coverImage: null, bodyOriginal: null, bodyKo: null })).toEqual([]);
  });
});

describe("validateAdminTags", () => {
  it("trims, drops blanks, dedupes case-insensitively and caps at 6", () => {
    expect(validateAdminTags([" AI ", "ai", "", "경제", "a", "b", "c", "d", "e"])).toEqual({
      ok: true,
      tags: ["AI", "경제", "a", "b", "c", "d"],
    });
  });
  it("rejects tags with CJK ideographs or kana", () => {
    const r = validateAdminTags(["경제", "經濟"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("經濟");
    expect(validateAdminTags(["カタカナ"]).ok).toBe(false);
  });
  it("rejects overly long tags and non-string input", () => {
    expect(validateAdminTags(["가".repeat(31)]).ok).toBe(false);
    expect(validateAdminTags("AI").ok).toBe(false);
    expect(validateAdminTags([1]).ok).toBe(false);
  });
  it("allows clearing all tags", () => {
    expect(validateAdminTags([])).toEqual({ ok: true, tags: [] });
  });
});

describe("parseAdminFilter", () => {
  it("defaults to all", () => {
    expect(parseAdminFilter(undefined)).toEqual({ key: "all" });
    expect(parseAdminFilter("bogus")).toEqual({ key: "all" });
  });
  it("maps processing to queued+processing", () => {
    expect(parseAdminFilter("processing")).toEqual({ key: "processing", statuses: ["queued", "processing"] });
  });
  it("maps published, failed and private", () => {
    expect(parseAdminFilter("published")).toEqual({ key: "published", statuses: ["published"] });
    expect(parseAdminFilter("failed")).toEqual({ key: "failed", statuses: ["failed"] });
    expect(parseAdminFilter("private")).toEqual({ key: "private", isPublic: false });
  });
});

describe("reprocessOptions", () => {
  it("disables everything while queued or processing", () => {
    for (const status of ["queued", "processing"] as const) {
      expect(reprocessOptions({ status, lang: "en" })).toEqual({ resume: false, fill: false, retranslate: false, full: false });
    }
  });
  it("offers resume only for failed and retranslate for any non-Korean language", () => {
    expect(reprocessOptions({ status: "failed", lang: "en" })).toEqual({ resume: true, fill: false, retranslate: true, full: true });
    expect(reprocessOptions({ status: "published", lang: "ko" })).toEqual({ resume: false, fill: false, retranslate: false, full: true });
    expect(reprocessOptions({ status: "failed", lang: null })).toEqual({ resume: true, fill: false, retranslate: false, full: true });
    expect(reprocessOptions({ status: "published", lang: "ja" })).toEqual({ resume: false, fill: false, retranslate: true, full: true });
  });
  it("offers fill only for published translated articles with missing blocks", () => {
    expect(reprocessOptions({ status: "published", lang: "en", bodyKo: [], untranslated: [2] }).fill).toBe(true);
    expect(reprocessOptions({ status: "published", lang: "en", bodyKo: [], untranslated: [] }).fill).toBe(false);
    expect(reprocessOptions({ status: "failed", lang: "en", bodyKo: [], untranslated: [2] }).fill).toBe(false);
    expect(reprocessOptions({ status: "published", lang: "en", bodyKo: null, untranslated: [2] }).fill).toBe(false);
  });
});

describe("isReprocessAllowed", () => {
  it("follows reprocessOptions", () => {
    expect(isReprocessAllowed({ status: "published", lang: "ko" }, "retranslate")).toBe(false);
    expect(isReprocessAllowed({ status: "published", lang: "ko" }, "resume")).toBe(false);
    expect(isReprocessAllowed({ status: "published", lang: "ko" }, "full")).toBe(true);
    expect(isReprocessAllowed({ status: "failed", lang: "en" }, "retranslate")).toBe(true);
    expect(isReprocessAllowed({ status: "processing", lang: "en" }, "full")).toBe(false);
  });
  it("rejects unknown modes", () => {
    expect(isReprocessAllowed({ status: "failed", lang: "en" }, "bogus" as never)).toBe(false);
  });
});
