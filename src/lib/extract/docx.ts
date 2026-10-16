import { JSDOM } from "jsdom";
import mammoth from "mammoth";
import { blocksToPlainText, type Block } from "@/lib/blocks";
import { htmlToBlocks } from "@/lib/extract/html-to-blocks";
import type { ExtractResult } from "@/lib/extract/types";
import { imageExt, MAX_IMAGES_PER_ARTICLE, measureImage, MIN_IMAGE_PX, type ImageStore } from "@/lib/images/rehost";

// 브라우저가 그대로 보여 줄 수 있는 형식만 올린다(EMF·WMF·BMP·TIFF 등은 건너뜀).
const WEB_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif"]);

const STYLE_MAP = ["p[style-name='Caption'] => p.caption:fresh", "p[style-name='캡션'] => p.caption:fresh"];

function isImageOnlyParagraph(el: Element | null): el is HTMLParagraphElement {
  if (!el || el.tagName.toUpperCase() !== "P") return false;
  if (el.querySelectorAll("img").length !== 1) return false;
  return (el.textContent ?? "").trim() === "";
}

// 이미지만 든 <p> 바로 뒤의 p.caption을 <figure>로 합치고, 나머지 p.caption은 일반 문단으로 돌린다.
export function attachDocxCaptions(html: string): string {
  const { document } = new JSDOM(`<body>${html}</body>`).window;
  // 건너뛴 이미지(src 없음)는 지운다. 남은 빈 문단 때문에 뒤따르는 캡션은 일반 문단이 된다.
  for (const img of Array.from(document.querySelectorAll("img"))) {
    if (!img.getAttribute("src")) img.remove();
  }
  for (const cap of Array.from(document.querySelectorAll("p.caption"))) {
    const prev = cap.previousElementSibling;
    if (isImageOnlyParagraph(prev)) {
      const figure = document.createElement("figure");
      figure.appendChild(prev.querySelector("img")!);
      const figcaption = document.createElement("figcaption");
      figcaption.textContent = cap.textContent ?? "";
      figure.appendChild(figcaption);
      prev.replaceWith(figure);
      cap.remove();
    } else {
      cap.removeAttribute("class");
    }
  }
  return document.body.innerHTML;
}

export async function extractFromDocx(bytes: Buffer, store: ImageStore): Promise<ExtractResult> {
  let uploaded = 0;
  const { value } = await mammoth.convertToHtml(
    { buffer: bytes },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (img) => {
        const contentType = (img.contentType ?? "").split(";")[0].trim().toLowerCase();
        if (!WEB_IMAGE_TYPES.has(contentType)) return { src: "" };
        try {
          const buf = await img.readAsBuffer();
          const { width, height } = measureImage(buf);
          if ((width !== undefined && width < MIN_IMAGE_PX) || (height !== undefined && height < MIN_IMAGE_PX)) return { src: "" };
          if (uploaded >= MAX_IMAGES_PER_ARTICLE) return { src: "" };
          uploaded += 1;
          return { src: await store.put(buf, contentType, `docx-${uploaded}.${imageExt(contentType)}`) };
        } catch (e) {
          console.error("[docx] image skipped", { error: e instanceof Error ? e.message : String(e) });
          return { src: "" };
        }
      }),
    },
  );

  const blocks: Block[] = htmlToBlocks(attachDocxCaptions(value));

  let title = "";
  const headingIdx = blocks.findIndex((b) => b.type === "heading");
  if (headingIdx >= 0) {
    const heading = blocks[headingIdx];
    if (heading.type === "heading") title = heading.text.trim();
    blocks.splice(headingIdx, 1);
  } else {
    const first = blocks.find((b) => b.type === "paragraph");
    if (first) title = blocksToPlainText([first]).trim().slice(0, 80);
  }

  const cover = blocks.find((b) => b.type === "figure");
  return { title, blocks, coverImage: cover && cover.type === "figure" ? cover.src : null };
}
