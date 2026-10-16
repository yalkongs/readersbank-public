import { describe, expect, it } from "vitest";
import { articleUrl, readerUrl } from "@/lib/share-urls";

describe("share urls", () => {
  it("readerUrl points to the chrome-less /read page for ElevenReader", () => {
    expect(readerUrl("https://readersbank.app", "abc-123")).toBe("https://readersbank.app/a/abc-123/read");
  });
  it("articleUrl points to the normal article page", () => {
    expect(articleUrl("https://readersbank.app", "abc-123")).toBe("https://readersbank.app/a/abc-123");
  });
});
