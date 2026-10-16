import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { extractFromGoogleDoc, parseGoogleDocId, titleFromDisposition } from "@/lib/extract/gdocs";
import { ExtractError } from "@/lib/extract/types";
import { FetchStatusError } from "@/lib/net/safe-fetch";
import type { ImageStore } from "@/lib/images/rehost";

const ID = "195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE";
const store: ImageStore = { put: async (_b, _t, name) => `https://x.public.blob.vercel-storage.com/${name}` };
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function docxBytes(): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ text: "Intro", heading: HeadingLevel.HEADING_1 }), new Paragraph("본문 문단입니다.")] }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

describe("parseGoogleDocId", () => {
  it("accepts edit/view/user-scoped document links", () => {
    expect(parseGoogleDocId(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(parseGoogleDocId(`https://docs.google.com/document/u/0/d/${ID}`)).toBe(ID);
  });
  it("ignores published-to-web, other Google apps and lookalike hosts", () => {
    expect(parseGoogleDocId(`https://docs.google.com/document/d/e/2PACX-${ID}/pub`)).toBeNull();
    expect(parseGoogleDocId(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBeNull();
    expect(parseGoogleDocId(`https://docs.google.com.evil.com/document/d/${ID}/edit`)).toBeNull();
  });
});

describe("titleFromDisposition", () => {
  it("prefers the UTF-8 filename and drops .docx", () => {
    expect(titleFromDisposition(`attachment; filename="a.docx"; filename*=UTF-8''%EB%AC%B8%EC%84%9C%20%EC%A0%9C%EB%AA%A9.docx`)).toBe("문서 제목");
    expect(titleFromDisposition('attachment; filename="Plain.docx"')).toBe("Plain");
    expect(titleFromDisposition(undefined)).toBe("");
  });
});

describe("extractFromGoogleDoc", () => {
  it("exports the doc as docx and uses the file name as title", async () => {
    const body = await docxBytes();
    const calls: string[] = [];
    const r = await extractFromGoogleDoc(`https://docs.google.com/document/d/${ID}/edit`, store, async (url) => {
      calls.push(url);
      return { url, status: 200, contentType: DOCX, body, contentDisposition: `attachment; filename*=UTF-8''My%20Doc.docx` };
    });
    expect(calls).toEqual([`https://docs.google.com/document/d/${ID}/export?format=docx`]);
    expect(r?.title).toBe("My Doc");
    expect(JSON.stringify(r?.blocks)).toContain("본문 문단입니다.");
  });
  it("explains sharing when the doc is private (login page or 401/403/404)", async () => {
    const html = async (url: string) => ({ url, status: 200, contentType: "text/html; charset=utf-8", body: Buffer.from("<html>login</html>") });
    await expect(extractFromGoogleDoc(`https://docs.google.com/document/d/${ID}/edit`, store, html)).rejects.toThrow(ExtractError);
    const denied = async () => {
      throw new FetchStatusError(403, "페이지 요청 실패 (HTTP 403)");
    };
    await expect(extractFromGoogleDoc(`https://docs.google.com/document/d/${ID}/edit`, store, denied)).rejects.toThrow(/링크가 있는 모든 사용자/);
  });
  it("returns null for non-Google-Docs urls", async () => {
    expect(await extractFromGoogleDoc("https://example.com/a", store)).toBeNull();
  });
});
