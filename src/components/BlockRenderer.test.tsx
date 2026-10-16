import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockList } from "@/components/BlockRenderer";

describe("BlockList", () => {
  it("drops unsafe hrefs and adds rel to safe links", () => {
    const html = renderToStaticMarkup(
      <BlockList
        blocks={[{ type: "paragraph", text: [{ text: "bad", href: "javascript:alert(1)" }, { text: "good", href: "https://x.com" }] }]}
      />,
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://x.com/"');
    expect(html).toContain('rel="noopener nofollow"');
  });
  it("renders figure with caption and lazy image", () => {
    const html = renderToStaticMarkup(<BlockList blocks={[{ type: "figure", src: "https://x.com/a.png", caption: "그림 1" }]} />);
    expect(html).toContain("<figure");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("그림 1");
  });
  it("escapes text content", () => {
    const html = renderToStaticMarkup(<BlockList blocks={[{ type: "paragraph", text: [{ text: "<script>x</script>" }] }]} />);
    expect(html).not.toContain("<script>");
  });
  it("marks untranslated blocks", () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={[{ type: "paragraph", text: [{ text: "a" }] }, { type: "paragraph", text: [{ text: "b" }] }]} untranslated={[1]} />,
    );
    expect(html.match(/번역 누락/g)).toHaveLength(1);
  });
});

describe("BlockList reading hooks", () => {
  it("adds heading ids and data-block-index", () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={[{ type: "heading", level: 2, text: "H" }, { type: "paragraph", text: [{ text: "b" }] }, { type: "divider" }]} />,
    );
    expect(html).toContain('id="h-0"');
    expect(html).toContain('data-block-index="0"');
    expect(html).toContain('data-block-index="1"');
    expect(html).toContain('data-block-index="2"');
  });
  it("puts a single data-block-index on untranslated wrappers", () => {
    const html = renderToStaticMarkup(<BlockList blocks={[{ type: "paragraph", text: [{ text: "b" }] }]} untranslated={[0]} />);
    expect(html.match(/data-block-index="0"/g)).toHaveLength(1);
  });
  it("renders a zoom button for figures only when onFigureClick is given", () => {
    const b = [{ type: "figure" as const, src: "https://x.com/a.png", caption: "c" }];
    expect(renderToStaticMarkup(<BlockList blocks={b} />)).not.toContain("<button");
    expect(renderToStaticMarkup(<BlockList blocks={b} onFigureClick={() => {}} />)).toContain("<button");
  });
});

describe("BlockList startIndex/anchors", () => {
  const blocks = [{ type: "heading" as const, level: 2 as const, text: "H" }];
  it("uses startIndex for ids and data-block-index", () => {
    const html = renderToStaticMarkup(<BlockList blocks={blocks} startIndex={3} />);
    expect(html).toContain('id="h-3"');
    expect(html).toContain('data-block-index="3"');
  });
  it("omits anchors when anchors=false", () => {
    const html = renderToStaticMarkup(<BlockList blocks={blocks} startIndex={3} anchors={false} />);
    expect(html).not.toContain('id="h-');
    expect(html).not.toContain("data-block-index");
  });
});

describe("BlockList math", () => {
  it("renders display math whose delimiters are split across plain inline pieces", async () => {
    const { renderMathMap } = await import("@/lib/math-render");
    const blocks = [{ type: "paragraph" as const, text: [{ text: "식은" }, { text: "\n" }, { text: " \\[" }, { text: "\n f(x)=\\sum_i a_i\n" }, { text: " \\]" }, { text: "이다 $n$." }] }];
    const html = renderToStaticMarkup(<BlockList blocks={blocks} math={renderMathMap(blocks)} />);
    expect(html).toContain("math-display");
    expect(html).toContain("math-inline");
    expect(html).not.toContain("\\[");
  });
  it("leaves text untouched without a math map", () => {
    const html = renderToStaticMarkup(<BlockList blocks={[{ type: "paragraph", text: [{ text: "$5 and $10" }] }]} />);
    expect(html).toContain("$5 and $10");
  });
});
