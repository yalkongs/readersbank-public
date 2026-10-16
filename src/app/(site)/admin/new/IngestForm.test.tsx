import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IngestForm } from "./IngestForm";

describe("IngestForm", () => {
  const html = renderToStaticMarkup(<IngestForm />);
  it("renders the paste button, textarea and file zone", () => {
    expect(html).toContain("붙여넣기");
    expect(html).toContain('placeholder="링크나 글을 붙여넣으세요"');
    expect(html).toContain("파일 올리기");
    expect(html).toContain("PDF · Word · HTML · 텍스트, 최대 25MB");
  });
  it("renders the visibility segmented control with public selected", () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>공개</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*비공개</);
    expect(html).toContain(`aria-label="공개 범위"`);
    expect(html).not.toContain("누구나 볼 수 있어요");
  });
  it("renders a disabled submit button while empty", () => {
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>등록<\/button>/);
  });
});
