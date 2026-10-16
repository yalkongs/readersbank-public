import { describe, expect, it } from "vitest";
import { CoverPlanSchema, buildCoverUser, finalImagePrompt } from "@/lib/cover-gen";

const art = { titleKo: "제목", titleOriginal: "제목", leadKo: "리드", summaryKo: ["요점 1", "요점 2"] };

describe("cover-gen prompts", () => {
  it("gives Opus the summary, tags, a body excerpt and recently used styles", () => {
    const u = buildCoverUser(art, {
      excerpt: "가".repeat(5000),
      tags: ["AI", "역사"],
      recent: [{ mood: "sober", medium: "oil painting", palette: "umber and slate" }],
    });
    expect(u).toContain("한 줄 소개: 리드");
    expect(u).not.toContain("원제:");
    expect(u).toContain("태그: AI, 역사");
    expect(u).toContain("가".repeat(3000));
    expect(u).not.toContain("가".repeat(3001));
    expect(u).toContain("- oil painting / umber and slate (sober)");
  });
  it("says so when there are no recent covers", () => {
    expect(buildCoverUser(art)).toContain("Recently used covers: none");
  });
  it("puts medium and palette into the final prompt and always forbids text", () => {
    const plan = CoverPlanSchema.parse({ mood: "wry", subject: "x", medium: "risograph print", palette: "fluoro pink and teal", prompt: "  A harbor.  " });
    expect(finalImagePrompt(plan)).toBe("A harbor.\n\nMedium: risograph print. Palette: fluoro pink and teal. No text, no letters, no words, no logos, no watermark.");
  });
});
