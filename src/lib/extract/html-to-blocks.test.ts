import { describe, expect, it } from "vitest";
import { htmlToBlocks } from "@/lib/extract/html-to-blocks";

describe("htmlToBlocks", () => {
  it("keeps YouTube iframes as video blocks and drops other iframes", () => {
    const blocks = htmlToBlocks(
      `<p>앞</p><figure><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?start=30"></iframe></figure>` +
        `<p><iframe data-src="//www.youtube-nocookie.com/embed/aaaaaaaaaaa"></iframe></p><iframe src="https://evil.com/x"></iframe><p>뒤</p>`,
      "https://site.com/post/1",
    );
    expect(blocks).toEqual([
      { type: "paragraph", text: [{ text: "앞" }] },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", start: 30 },
      { type: "video", provider: "youtube", id: "aaaaaaaaaaa" },
      { type: "paragraph", text: [{ text: "뒤" }] },
    ]);
  });

  it("keeps figure with figcaption and resolves relative src", () => {
    const blocks = htmlToBlocks(
      `<figure><img src="/img/a.png" width="800" height="600"><figcaption> Figure 1:  The chart </figcaption></figure>`,
      "https://site.com/post/1",
    );
    expect(blocks).toEqual([
      { type: "figure", src: "https://site.com/img/a.png", original_src: "https://site.com/img/a.png", caption: "Figure 1: The chart", width: 800, height: 600 },
    ]);
  });
  it("converts headings, paragraphs with inline styles, lists, quotes, code, tables, hr", () => {
    const blocks = htmlToBlocks(
      `<div><h1>T</h1><h3>Sub</h3><p>Hello <strong>bold</strong> and <a href="https://x.com">link</a> <a href="javascript:alert(1)">bad</a></p>
       <ul><li>one</li><li><em>two</em></li></ul><blockquote><p>Q</p></blockquote><pre>let x = 1;</pre>
       <table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><hr></div>`,
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "T" },
      { type: "heading", level: 3, text: "Sub" },
      {
        type: "paragraph",
        text: [{ text: "Hello " }, { text: "bold", bold: true }, { text: " and " }, { text: "link", href: "https://x.com/" }, { text: " " }, { text: "bad" }],
      },
      { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two", italic: true }]] },
      { type: "quote", text: [{ text: "Q" }] },
      { type: "code", text: "let x = 1;" },
      { type: "table", rows: [["a", "b"], ["1", "2"]] },
      { type: "divider" },
    ]);
  });
  it("turns an image-only paragraph into a figure and drops scripts", () => {
    const blocks = htmlToBlocks(`<p><img src="https://x.com/b.jpg" alt="b"></p><script>alert(1)</script><p>text</p>`);
    expect(blocks).toEqual([
      { type: "figure", src: "https://x.com/b.jpg", original_src: "https://x.com/b.jpg", alt: "b" },
      { type: "paragraph", text: [{ text: "text" }] },
    ]);
  });
  it("wraps loose text in a container into a paragraph", () => {
    expect(htmlToBlocks(`<div>loose <b>text</b></div>`)).toEqual([{ type: "paragraph", text: [{ text: "loose " }, { text: "text", bold: true }] }]);
  });
  it("keeps separate paragraphs in a blockquote as separate quotes", () => {
    expect(htmlToBlocks(`<blockquote><p>A</p><p>B</p></blockquote>`)).toEqual([
      { type: "quote", text: [{ text: "A" }] },
      { type: "quote", text: [{ text: "B" }] },
    ]);
  });
  it("separates nested list content inside a list item", () => {
    const [list] = htmlToBlocks(`<ul><li>one<ul><li>a</li><li>b</li></ul></li></ul>`);
    expect(list.type).toBe("list");
    if (list.type === "list") expect(list.items[0].map((x) => x.text).join("")).toBe("one\na\nb");
  });
  it("keeps a figure without img by walking its contents", () => {
    expect(htmlToBlocks(`<figure><pre>code()</pre><figcaption>Listing 1</figcaption></figure>`)).toEqual([
      { type: "code", text: "code()" },
      { type: "paragraph", text: [{ text: "Listing 1" }] },
    ]);
  });
  it("splits loose text on consecutive <br> into paragraphs but keeps a single <br> as a newline", () => {
    const blocks = htmlToBlocks(`<div>First para text.<br><br>Second para <b>bold</b>.<br>same para line</div>`);
    expect(blocks).toEqual([
      { type: "paragraph", text: [{ text: "First para text." }] },
      {
        type: "paragraph",
        text: [{ text: "Second para " }, { text: "bold", bold: true }, { text: "." }, { text: "\n" }, { text: "same para line" }],
      },
    ]);
  });
  it("treats <font> content with <br><br> as separate paragraphs", () => {
    const blocks = htmlToBlocks(`<font>A<br><br>B</font>`);
    expect(blocks).toEqual([
      { type: "paragraph", text: [{ text: "A" }] },
      { type: "paragraph", text: [{ text: "B" }] },
    ]);
  });
  it("ignores whitespace between consecutive <br> and extra breaks", () => {
    const blocks = htmlToBlocks(`<div>A<br> <br>\n<br>B</div>`);
    expect(blocks).toEqual([
      { type: "paragraph", text: [{ text: "A" }] },
      { type: "paragraph", text: [{ text: "B" }] },
    ]);
  });
  it("skips svg regardless of tag-name case", () => {
    const blocks = htmlToBlocks(`<p>Hi<svg><title>icon</title></svg></p>`);
    expect(blocks).toEqual([{ type: "paragraph", text: [{ text: "Hi" }] }]);
  });

  it("walks an inline wrapper containing block elements as a container", () => {
    const blocks = htmlToBlocks(`<div><span>July 2023<p>First para.</p><p>Second <i>para</i>.</p><blockquote>Quote</blockquote></span></div>`);
    expect(blocks).toEqual([
      { type: "paragraph", text: [{ text: "July 2023" }] },
      { type: "paragraph", text: [{ text: "First para." }] },
      { type: "paragraph", text: [{ text: "Second " }, { text: "para", italic: true }, { text: "." }] },
      { type: "quote", text: [{ text: "Quote" }] },
    ]);
  });

  it("keeps an inline-only paragraph as one paragraph", () => {
    const blocks = htmlToBlocks(`<p><span>a</span> <b>b</b></p>`);
    expect(blocks).toEqual([{ type: "paragraph", text: [{ text: "a" }, { text: " " }, { text: "b", bold: true }] }]);
  });

  it("splits a span wrapping many paragraphs (paulgraham structure)", () => {
    const html = `<div><tbody><tr><td><img src="https://x.com/t.gif" width="185" height="18" alt="T"><span>Date<p>${"word ".repeat(50)}</p><p>${"more ".repeat(50)}</p></span></td></tr></tbody></div>`;
    const blocks = htmlToBlocks(html, "https://x.com/");
    expect(blocks[0].type).toBe("figure");
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const b of blocks) {
      if (b.type === "paragraph") {
        expect(b.text.map((t) => t.text).join("").length).toBeLessThan(400);
      }
    }
  });

  it("walks a <p> containing block descendants as a container", () => {
    const blocks = htmlToBlocks(`<p>Intro<div>Inner</div></p>`);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("htmlToBlocks images in inline wrappers and alt text", () => {
  it("pulls <a><img></a> inside a container out as a figure and keeps meaningful alt", () => {
    const blocks = htmlToBlocks(
      `<div>앞 문장 <a href="https://x.com/full.png"><img src="https://x.com/a.png" alt="분기별 매출 추이 그래프"></a> 뒤 문장</div>`,
    );
    expect(blocks.some((b) => b.type === "figure" && b.src === "https://x.com/a.png" && b.alt === "분기별 매출 추이 그래프")).toBe(true);
    expect(JSON.stringify(blocks)).toContain("앞 문장");
  });
  it("drops filename-like or generic alt", () => {
    const blocks = htmlToBlocks(`<figure><img src="https://x.com/a.png" alt="IMG_1234.jpg"></figure><figure><img src="https://x.com/b.png" alt="image"></figure>`);
    expect(blocks.every((b) => b.type !== "figure" || b.alt === undefined)).toBe(true);
  });
});
