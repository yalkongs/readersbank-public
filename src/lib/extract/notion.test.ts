import { describe, expect, it } from "vitest";
import { extractFromNotion, notionRecordToBlocks, parseNotionPageId, unwrapBlock } from "@/lib/extract/notion";
import { ExtractError } from "@/lib/extract/types";

const ID = "1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6";
const UUID = "1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6";

describe("parseNotionPageId", () => {
  it.each([
    `https://www.notion.so/team/My-Page-${ID}`,
    `https://www.notion.so/team/My-Page-${ID}?pvs=4#abc`,
    `https://myspace.notion.site/${ID}`,
    `https://www.notion.so/${UUID}`,
    `https://www.notion.so/team/My-Page?p=${ID}&pm=s`,
  ])("%s", (url) => expect(parseNotionPageId(url)).toBe(UUID));
  it("returns null when no id", () => expect(parseNotionPageId("https://www.notion.so/team")).toBeNull());
});

describe("unwrapBlock", () => {
  it("handles single and double wrapped values", () => {
    expect(unwrapBlock({ value: { id: "a", type: "text" } })?.id).toBe("a");
    expect(unwrapBlock({ value: { value: { id: "b", type: "text" }, role: "reader" } })?.id).toBe("b");
    expect(unwrapBlock(undefined)).toBeNull();
  });
});

describe("notionRecordToBlocks", () => {
  const block = (id: string, v: Record<string, unknown>) => ({ value: { id, ...v } });
  const recordMap = {
    block: {
      [UUID]: block(UUID, { type: "page", properties: { title: [["My Page"]] }, content: ["h", "p", "b1", "b2", "n1", "img", "d", "q", "c"] }),
      h: block("h", { type: "header", properties: { title: [["Intro"]] } }),
      p: block("p", { type: "text", properties: { title: [["Hello "], ["bold", [["b"]]], [" link", [["a", "https://x.com"]]]] } }),
      b1: block("b1", { type: "bulleted_list", properties: { title: [["one"]] } }),
      b2: block("b2", { type: "bulleted_list", properties: { title: [["two"]] } }),
      n1: block("n1", { type: "numbered_list", properties: { title: [["first"]] } }),
      img: block("img", { type: "image", properties: { caption: [["Figure 1"]] }, format: { display_source: "https://img.example/a.png" } }),
      d: block("d", { type: "divider" }),
      q: block("q", { type: "quote", properties: { title: [["wise"]] } }),
      c: block("c", { type: "code", properties: { title: [["x = 1"]] } }),
    },
    signed_urls: { img: "https://signed.example/a.png" },
  };
  it("maps blocks, groups lists, prefers signed image urls", () => {
    const r = notionRecordToBlocks(recordMap, UUID);
    expect(r.title).toBe("My Page");
    expect(r.blocks).toEqual([
      { type: "heading", level: 2, text: "Intro" },
      { type: "paragraph", text: [{ text: "Hello " }, { text: "bold", bold: true }, { text: " link", href: "https://x.com/" }] },
      { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
      { type: "list", ordered: true, items: [[{ text: "first" }]] },
      { type: "figure", src: "https://signed.example/a.png", original_src: "https://signed.example/a.png", caption: "Figure 1" },
      { type: "divider" },
      { type: "quote", text: [{ text: "wise" }] },
      { type: "code", text: "x = 1" },
    ]);
    expect(r.coverImage).toBe("https://signed.example/a.png");
  });
});

describe("notionRecordToBlocks extras", () => {
  const block = (id: string, v: Record<string, unknown>) => ({ value: { value: { id, ...v }, role: "reader" } });
  it("handles toggle children, tables and bookmarks", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["t", "tb", "bm"] }),
          t: block("t", { type: "toggle", properties: { title: [["More"]] }, content: ["c"] }),
          c: block("c", { type: "text", properties: { title: [["inside"]] } }),
          tb: block("tb", { type: "table", format: { table_block_column_order: ["a", "b"] }, content: ["r1"] }),
          r1: block("r1", { type: "table_row", properties: { b: [["B"]], a: [["A"]] } }),
          bm: block("bm", { type: "bookmark", properties: { link: [["https://x.com"]], title: [["X"]] } }),
        },
      },
      UUID,
    );
    expect(r.blocks).toEqual([
      { type: "paragraph", text: [{ text: "More" }] },
      { type: "paragraph", text: [{ text: "inside" }] },
      { type: "table", rows: [["A", "B"]] },
      { type: "paragraph", text: [{ text: "X", href: "https://x.com/" }] },
    ]);
  });
});

describe("extractFromNotion", () => {
  it("throws ExtractError for bad url or empty page", async () => {
    await expect(extractFromNotion("https://www.notion.so/team", { getPage: async () => ({}) })).rejects.toBeInstanceOf(ExtractError);
    await expect(
      extractFromNotion(`https://www.notion.so/${ID}`, { getPage: async () => ({ block: {} }) }),
    ).rejects.toBeInstanceOf(ExtractError);
  });
});

describe("fix round 1", () => {
  const A = "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa";
  const B = "bbbbbbbbbbbb4bbbbbbbbbbbbbbbbbbb";
  const block = (id: string, v: Record<string, unknown>) => ({ value: { id, ...v } });
  it("prefers the p query param over the path segment", () => {
    expect(parseNotionPageId(`https://www.notion.so/team/${A}?v=x&p=${B}`)).toBe(
      "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    );
  });
  it("maps header_4 to heading level 4", () => {
    const r = notionRecordToBlocks(
      { block: { [UUID]: block(UUID, { type: "page", content: ["h4"] }), h4: block("h4", { type: "header_4", properties: { title: [["Deep"]] } }) } },
      UUID,
    );
    expect(r.blocks).toEqual([{ type: "heading", level: 4, text: "Deep" }]);
  });
  it("skips non-http image sources, keeping the caption as a paragraph", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["i"] }),
          i: block("i", { type: "image", properties: { source: [["attachment:abc:x.png"]], caption: [["Cap"]] } }),
        },
      },
      UUID,
    );
    expect(r.blocks).toEqual([{ type: "paragraph", text: [{ text: "Cap" }] }]);
    expect(r.coverImage).toBeNull();
  });
});

describe("container blocks", () => {
  const block = (id: string, v: Record<string, unknown>) => ({ value: { id, ...v } });
  const text = (id: string, t: string, extra: Record<string, unknown> = {}) => block(id, { type: "text", properties: { title: [[t]] }, ...extra });

  it("walks column_list → column → text", async () => {
    const recordMap = {
      block: {
        [UUID]: block(UUID, { type: "page", content: ["cl"] }),
        cl: block("cl", { type: "column_list", content: ["c1", "c2"] }),
        c1: block("c1", { type: "column", content: ["t1"] }),
        c2: block("c2", { type: "column", content: ["t2"] }),
        t1: text("t1", "left"),
        t2: text("t2", "right"),
      },
    };
    const r = await extractFromNotion(`https://www.notion.so/${ID}`, { getPage: async () => recordMap });
    expect(r.blocks).toEqual([
      { type: "paragraph", text: [{ text: "left" }] },
      { type: "paragraph", text: [{ text: "right" }] },
    ]);
  });

  it("appends indented children after their parent block", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["p", "after"] }),
          p: text("p", "parent", { content: ["child"] }),
          child: text("child", "child"),
          after: text("after", "after"),
        },
      },
      UUID,
    );
    expect(r.blocks.map((b) => (b.type === "paragraph" ? b.text[0].text : b.type))).toEqual(["parent", "child", "after"]);
  });

  it("maps to_do to unordered list items with a checkbox prefix", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["a", "b"] }),
          a: block("a", { type: "to_do", properties: { title: [["done"]], checked: [["Yes"]] } }),
          b: block("b", { type: "to_do", properties: { title: [["open"]] } }),
        },
      },
      UUID,
    );
    expect(r.blocks).toEqual([{ type: "list", ordered: false, items: [[{ text: "☑ " }, { text: "done" }], [{ text: "☐ " }, { text: "open" }]] }]);
  });

  it("includes synced block content via containers and references", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["sc", "ref", "ref2"] }),
          sc: block("sc", { type: "transclusion_container", content: ["s1"] }),
          s1: text("s1", "synced"),
          ref: block("ref", { type: "transclusion_reference", format: { transclusion_reference_pointer: { id: "orig", table: "block" } } }),
          orig: block("orig", { type: "transclusion_container", content: ["s2"] }),
          s2: text("s2", "referenced"),
          ref2: block("ref2", { type: "transclusion_reference", content: ["s3"] }),
          s3: text("s3", "fallback"),
        },
      },
      UUID,
    );
    expect(r.blocks.map((b) => (b.type === "paragraph" ? b.text[0].text : b.type))).toEqual(["synced", "referenced", "fallback"]);
  });

  it("does not inline sub-page content", () => {
    const r = notionRecordToBlocks(
      {
        block: {
          [UUID]: block(UUID, { type: "page", content: ["t", "sub"] }),
          t: text("t", "top"),
          sub: block("sub", { type: "page", properties: { title: [["Sub"]] }, content: ["inner"] }),
          inner: text("inner", "inner"),
        },
      },
      UUID,
    );
    expect(r.blocks).toEqual([{ type: "paragraph", text: [{ text: "top" }] }]);
  });
});
