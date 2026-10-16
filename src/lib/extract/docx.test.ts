import { Document, HeadingLevel, ImageRun, Packer, Paragraph } from "docx";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { attachDocxCaptions, extractFromDocx } from "@/lib/extract/docx";
import type { ImageStore } from "@/lib/images/rehost";

// 1x1 PNG
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// 단색 RGB PNG(w×h)
function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = png(200, 150);

describe("attachDocxCaptions", () => {
  it("merges an image paragraph with the following caption", () => {
    const html = attachDocxCaptions(`<p><img src="https://b/x.png" /></p><p class="caption">Figure 1</p><p class="caption">Orphan</p>`);
    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>Figure 1</figcaption>");
    expect(html).toContain("<p>Orphan</p>");
  });
  it("does not attach a caption that precedes the image", () => {
    const html = attachDocxCaptions(`<p class="caption">Before</p><p><img src="https://b/x.png" /></p>`);
    expect(html).not.toContain("<figcaption>");
    expect(html).toContain("<p>Before</p>");
  });
});

describe("extractFromDocx", () => {
  it("extracts headings, paragraphs and uploads images", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "Report Title", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "First paragraph of the report." }),
            new Paragraph({ children: [new ImageRun({ type: "png", data: PNG, transformation: { width: 200, height: 100 } })] }),
            new Paragraph({ text: "Figure 1: Chart", style: "Caption" }),
          ],
        },
      ],
    });
    const bytes = Buffer.from(await Packer.toBuffer(doc));
    const puts: string[] = [];
    const store: ImageStore = { async put(_b, ct, name) { puts.push(`${name}|${ct}`); return `https://blob.example/${name}`; } };
    const r = await extractFromDocx(bytes, store);
    expect(r.title).toBe("Report Title");
    expect(r.blocks[0]).toEqual({ type: "paragraph", text: [{ text: "First paragraph of the report." }] });
    expect(r.blocks.some((b) => b.type === "figure" && b.src.startsWith("https://blob.example/docx-1"))).toBe(true);
    expect(r.coverImage).toMatch(/^https:\/\/blob\.example\/docx-1/);
    expect(puts).toHaveLength(1);
  });
});

describe("extractFromDocx image rules", () => {
  const image = (data: Buffer, type: "png" | "bmp" = "png") =>
    new Paragraph({ children: [new ImageRun({ type, data, transformation: { width: 200, height: 100 } } as never)] });
  const build = async (children: Paragraph[]) =>
    Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ text: "Body text paragraph." }), ...children] }] })));
  const recording = () => {
    const puts: string[] = [];
    const store: ImageStore = { async put(_b, ct, name) { puts.push(`${name}|${ct}`); return `https://blob.example/${name}`; } };
    return { puts, store };
  };

  it("skips tiny images and keeps a following caption as a paragraph", async () => {
    const { puts, store } = recording();
    const r = await extractFromDocx(await build([image(TINY_PNG), new Paragraph({ text: "Figure 1: Tiny", style: "Caption" })]), store);
    expect(puts).toEqual([]);
    expect(r.blocks.some((b) => b.type === "figure")).toBe(false);
    expect(r.blocks).toContainEqual({ type: "paragraph", text: [{ text: "Figure 1: Tiny" }] });
    expect(r.coverImage).toBeNull();
  });

  it("skips images that are not web-displayable", async () => {
    const { puts, store } = recording();
    const bmp = Buffer.alloc(54 + 200 * 150 * 3);
    bmp.write("BM", 0, "ascii");
    bmp.writeUInt32LE(bmp.length, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(200, 18);
    bmp.writeInt32LE(150, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    const r = await extractFromDocx(await build([image(bmp, "bmp"), image(PNG)]), store);
    expect(puts).toEqual(["docx-1.png|image/png"]);
    expect(r.blocks.filter((b) => b.type === "figure")).toHaveLength(1);
  });

  it("drops an image whose upload fails without failing the document", async () => {
    let calls = 0;
    const store: ImageStore = {
      async put(_b, _ct, name) {
        calls += 1;
        if (calls === 1) throw new Error("blob down");
        return `https://blob.example/${name}`;
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await extractFromDocx(await build([image(PNG), image(PNG)]), store);
    expect(spy).toHaveBeenCalledWith("[docx] image skipped", { error: "blob down" });
    spy.mockRestore();
    const figures = r.blocks.filter((b) => b.type === "figure");
    expect(figures).toHaveLength(1);
    expect(r.blocks.some((b) => b.type === "figure" && b.src === "")).toBe(false);
  });

  it("stops uploading after the per-article image limit", async () => {
    const { puts, store } = recording();
    const r = await extractFromDocx(await build(Array.from({ length: 42 }, () => image(PNG))), store);
    expect(puts).toHaveLength(40);
    expect(r.blocks.filter((b) => b.type === "figure")).toHaveLength(40);
  });
});
